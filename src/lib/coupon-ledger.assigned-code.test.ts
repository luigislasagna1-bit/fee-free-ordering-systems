/**
 * Regression: a BROADCAST coupon code (FIRSTBUY, Autopilot WIN1, any
 * onceLifetimePerClient promo) must never be treated as identity-bound.
 *
 * The 2026-08-14 bug: recordAppliedCoupons stamps a CustomerCoupon row with the
 * redeemer's email for every trackable promo. resolveAssignedPromoByCode matched
 * on the CODE alone, so the first person to redeem FIRSTBUY owned it — everyone
 * after them hit "This code is registered to a different email address", which
 * the order route turns into a hard 400 (rejected order, not just a lost
 * discount). Luigi's customers reported exactly this.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const couponFindMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({
  default: { customerCoupon: { findMany: (...a: any[]) => couponFindMany(...a) } },
}));

import { resolveAssignedPromoByCode } from "./coupon-ledger";
import { isAssignedCampaignRef } from "./assigned-promos";

beforeEach(() => vi.clearAllMocks());

/** A ledger row as recordAppliedCoupons would write it after a redemption. */
const row = (over: Partial<any> = {}) => ({
  id: "cc1",
  promotionId: "promo1",
  email: "first.customer@example.com",
  phone: null,
  promotion: { campaignRef: "kickstarter_first_buy" },
  ...over,
});

describe("isAssignedCampaignRef", () => {
  it("is true only for personally/group assigned refs", () => {
    expect(isAssignedCampaignRef("assigned_manual")).toBe(true);
    expect(isAssignedCampaignRef("assigned_group:abc")).toBe(true);
  });

  it("is false for broadcast and owner-made promos", () => {
    for (const ref of [null, undefined, "", "kickstarter_first_buy", "autopilot_win_back_1", "autopilot_cart_recovery"]) {
      expect(isAssignedCampaignRef(ref)).toBe(false);
    }
  });
});

describe("resolveAssignedPromoByCode", () => {
  it("🚨 FIRSTBUY redeemed by someone else does NOT block a new customer", async () => {
    // Simulate a DB that ignored the filter — the in-code guard must still hold.
    couponFindMany.mockResolvedValue([row()]);
    const res = await resolveAssignedPromoByCode({
      restaurantId: "r1",
      code: "FIRSTBUY",
      email: "someone.else@example.com",
      phone: null,
    });
    expect(res.kind).toBe("none"); // NOT "mismatch" — the order must go through
  });

  it("scopes the query to assigned campaignRefs", async () => {
    couponFindMany.mockResolvedValue([]);
    await resolveAssignedPromoByCode({ restaurantId: "r1", code: "FIRSTBUY", email: "a@b.com" });
    const where = couponFindMany.mock.calls[0][0].where;
    expect(where.promotion.is.OR).toEqual([
      { campaignRef: { startsWith: "assigned_manual" } },
      { campaignRef: { startsWith: "assigned_group" } },
    ]);
    expect(where.promotion.is.isActive).toBe(true);
  });

  it("an Autopilot win-back code is not identity-bound either", async () => {
    couponFindMany.mockResolvedValue([row({ promotion: { campaignRef: "autopilot_win_back_1" } })]);
    const res = await resolveAssignedPromoByCode({ restaurantId: "r1", code: "WIN1", email: "new@example.com" });
    expect(res.kind).toBe("none");
  });

  it("still REFUSES a genuine 1:1 gift typed with the wrong email", async () => {
    couponFindMany.mockResolvedValue([
      row({ email: "erik@example.com", promotion: { campaignRef: "assigned_manual" } }),
    ]);
    const res = await resolveAssignedPromoByCode({
      restaurantId: "r1",
      code: "SORRY10-ERIK",
      email: "impostor@example.com",
    });
    expect(res.kind).toBe("mismatch");
  });

  it("still MATCHES the rightful owner of a 1:1 gift (email, case-insensitive)", async () => {
    couponFindMany.mockResolvedValue([
      row({ email: "erik@example.com", promotion: { campaignRef: "assigned_manual" } }),
    ]);
    const res = await resolveAssignedPromoByCode({
      restaurantId: "r1",
      code: "SORRY10-ERIK",
      email: "ERIK@example.com",
    });
    expect(res).toMatchObject({ kind: "match", promotionId: "promo1", grantId: "cc1" });
  });

  it("still matches a 1:1 gift by phone across formats (E.164 vs bare)", async () => {
    couponFindMany.mockResolvedValue([
      row({ email: null, phone: "9053854444", promotion: { campaignRef: "assigned_manual" } }),
    ]);
    const res = await resolveAssignedPromoByCode({
      restaurantId: "r1",
      code: "GIFT",
      phone: "+1 (905) 385-4444",
    });
    expect(res.kind).toBe("match");
  });

  it("degrades to none when the lookup throws (never breaks checkout)", async () => {
    couponFindMany.mockRejectedValue(new Error("db down"));
    const res = await resolveAssignedPromoByCode({ restaurantId: "r1", code: "X", email: "a@b.com" });
    expect(res.kind).toBe("none");
  });
});
