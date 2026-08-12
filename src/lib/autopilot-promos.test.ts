import { describe, it, expect, vi, beforeEach } from "vitest";
// activationPatch is pure, but the module imports the prisma client at top level.
const findMany = vi.fn();
const findUnique = vi.fn();
vi.mock("@/lib/db", () => ({
  default: {
    promotion: { findMany: (...a: any[]) => findMany(...a) },
    autopilotState: { findUnique: (...a: any[]) => findUnique(...a) },
  },
}));
import {
  activationPatch, OFFER_GRACE_MS, getStepPromos, isCampaignOwned, liveCampaignRefs,
} from "./autopilot-promos";

const NOW = new Date("2026-07-14T00:00:00.000Z");

describe("activationPatch — honor delivered offer codes (CARTBACK bug)", () => {
  it("enabling makes the code fully live + open-ended (clears any grace end)", () => {
    expect(activationPatch(true, null, NOW)).toEqual({ isActive: true, endsAt: null });
    expect(activationPatch(true, new Date("2026-08-01"), NOW)).toEqual({ isActive: true, endsAt: null });
  });

  it("disabling an open code stamps a grace end but keeps it redeemable (isActive stays true)", () => {
    const patch = activationPatch(false, null, NOW);
    expect(patch.isActive).toBe(true); // NOT deactivated — inbox codes must still work
    expect(patch.endsAt).toEqual(new Date(NOW.getTime() + OFFER_GRACE_MS));
  });

  it("disabling a code already in its grace window is a no-op (doesn't keep pushing the end out)", () => {
    const existingEnd = new Date("2026-07-20T00:00:00.000Z");
    expect(activationPatch(false, existingEnd, NOW)).toEqual({});
  });

  it("grace window is 30 days", () => {
    expect(OFFER_GRACE_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

// ─── The WIN1 incident (Luigi 2026-08-11, Ben Bilton) ────────────────────────
// A routine promo cleanup on 2026-07-03 switched WIN1..WIN5 + CARTBACK off from
// the Promotions list. getStepPromos selected on campaignRef alone, so the
// re-engagement drip kept stamping ?coupon=WIN1 into emails against a dead row:
// 54 emails, 52 customers, five weeks, 0 redemptions. Two locks below — the
// sender can't advertise a code that isn't redeemable, and the list can't switch
// off a code a running campaign still owns.

describe("getStepPromos — never advertise a code that can't be redeemed", () => {
  beforeEach(() => { findMany.mockReset(); });

  it("asks the DB only for ACTIVE codes inside their date window", async () => {
    findMany.mockResolvedValue([]);
    const now = new Date("2026-08-11T12:00:00.000Z");
    await getStepPromos("r1", "reengagement", now);

    const where = findMany.mock.calls[0][0].where;
    expect(where.isActive).toBe(true);
    expect(where.AND).toEqual([
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ]);
    // Still scoped to this restaurant's win-back ladder and nothing else.
    expect(where.restaurantId).toBe("r1");
    expect(where.campaignRef.in).toContain("autopilot_reengage_win1");
  });

  it("returns nothing for a step whose promo the query excluded (→ couponless email)", async () => {
    findMany.mockResolvedValue([]); // WIN1 is switched off, so it isn't returned
    const map = await getStepPromos("r1", "reengagement");
    expect(map.get(1)).toBeUndefined();
    expect(map.size).toBe(0);
  });

  it("maps a live code to its step, carrying the owner's edited percent", async () => {
    // Luigi lowered WIN1's default 10% to 5% in the step editor.
    findMany.mockResolvedValue([
      { campaignSequence: 1, couponCode: "WIN1", ruleConfig: { discountPercent: 5 } },
    ]);
    const map = await getStepPromos("r1", "reengagement");
    expect(map.get(1)).toEqual({ couponCode: "WIN1", discountPercent: 5 });
  });

  it("treats second_order's null sequence as step 1", async () => {
    findMany.mockResolvedValue([
      { campaignSequence: null, couponCode: "2NDOFF", ruleConfig: { discountPercent: 15 } },
    ]);
    const map = await getStepPromos("r1", "second_order");
    expect(map.get(1)).toEqual({ couponCode: "2NDOFF", discountPercent: 15 });
  });

  it("has no codes to look up for cart_abandonment (its offer is resolved elsewhere)", async () => {
    const map = await getStepPromos("r1", "cart_abandonment");
    expect(map.size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("campaign ownership — the codes a promo cleanup must not be able to kill", () => {
  beforeEach(() => { findUnique.mockReset(); });

  it("recognises every autopilot-owned ref, and nothing else", () => {
    for (const ref of [
      "autopilot_reengage_win1", "autopilot_reengage_win5",
      "autopilot_2nd_order", "autopilot_cart_recovery",
    ]) expect(isCampaignOwned(ref)).toBe(true);

    for (const ref of [null, undefined, "", "kickstarter_first_buy", "assigned_manual", "assigned_group:x"]) {
      expect(isCampaignOwned(ref)).toBe(false);
    }
  });

  it("locks exactly the refs whose campaign toggle is ON", async () => {
    findUnique.mockResolvedValue({
      masterEnabled: true, reEngageEnabled: true,
      secondOrderEnabled: false, cartAbandonmentEnabled: true,
    });
    const live = await liveCampaignRefs("r1");
    expect(live.has("autopilot_reengage_win1")).toBe(true);
    expect(live.has("autopilot_reengage_win5")).toBe(true);
    expect(live.has("autopilot_cart_recovery")).toBe(true);
    expect(live.has("autopilot_2nd_order")).toBe(false); // campaign is off — free to retire
  });

  it("locks nothing when the master switch is off", async () => {
    findUnique.mockResolvedValue({
      masterEnabled: false, reEngageEnabled: true,
      secondOrderEnabled: true, cartAbandonmentEnabled: true,
    });
    expect((await liveCampaignRefs("r1")).size).toBe(0);
  });

  it("locks nothing for a store that never enabled Autopilot", async () => {
    findUnique.mockResolvedValue(null);
    expect((await liveCampaignRefs("r1")).size).toBe(0);
  });

  it("degrades to 'nothing locked' if the lookup throws — never blocks an owner's edit", async () => {
    findUnique.mockRejectedValue(new Error("db down"));
    await expect(liveCampaignRefs("r1")).resolves.toEqual(new Set());
  });
});
