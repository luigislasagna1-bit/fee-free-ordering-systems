import { describe, it, expect, vi, beforeEach } from "vitest";

const groupFindMany = vi.fn();
const memberFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  default: {
    customerGroup: { findMany: (...a: any[]) => groupFindMany(...a) },
    customerGroupMember: { findMany: (...a: any[]) => memberFindMany(...a) },
  },
}));

import {
  resolveAutopilotAudience,
  normalizeVipMode,
  vipModeFieldFor,
  DEFAULT_VIP_MODE,
} from "./autopilot-audience";

/**
 * Luigi 2026-08-11, from Ben Bilton's report. Ben is a VIP Pizza Club member
 * (linked by customerId, no email row) and was emailed a 5%-off win-back on top
 * of the 30% club discount he already holds. Ten of the store's first sixty-five
 * Autopilot emails went to club members.
 *
 * The rules these lock:
 *   - a store with no ticked group pays ZERO extra queries and behaves exactly
 *     as it did before this feature existed;
 *   - membership matches by customerId OR email OR phone, because the group can
 *     be built from linked customers, pasted addresses, or typed contacts;
 *   - a lookup failure means "nobody is a member", never "mute everyone".
 */
describe("resolveAutopilotAudience", () => {
  beforeEach(() => { groupFindMany.mockReset(); memberFindMany.mockReset(); });

  const CLUB = { id: "g1", name: "🍕Luigi's VIP Pizza Club", memberLabel: "VIP" };

  it("costs NOTHING and matches nobody when no group is ticked", async () => {
    groupFindMany.mockResolvedValue([]);
    const a = await resolveAutopilotAudience("r1", [{ customerId: "c1", email: "a@b.com" }]);
    expect(a.hasClubs).toBe(false);
    expect(a.match({ customerId: "c1" })).toBeNull();
    // The expensive query is never even reached.
    expect(memberFindMany).not.toHaveBeenCalled();
  });

  it("skips both queries entirely for an empty candidate list", async () => {
    const a = await resolveAutopilotAudience("r1", []);
    expect(a.hasClubs).toBe(false);
    expect(groupFindMany).not.toHaveBeenCalled();
  });

  it("only ever looks at groups the owner ticked, scoped to this restaurant", async () => {
    groupFindMany.mockResolvedValue([CLUB]);
    memberFindMany.mockResolvedValue([]);
    await resolveAutopilotAudience("r1", [{ customerId: "c1", email: "A@B.com" }]);

    expect(groupFindMany.mock.calls[0][0].where).toEqual({ restaurantId: "r1", skipAutopilotOffers: true });
    const where = memberFindMany.mock.calls[0][0].where;
    expect(where.restaurantId).toBe("r1");
    expect(where.groupId).toEqual({ in: ["g1"] });
    // Bounded by the CANDIDATES, not by club size — a 50k-member club costs the
    // same as a 30-member one.
    expect(where.OR).toContainEqual({ customerId: { in: ["c1"] } });
    // Member emails are stored lower-cased, so the lookup must be too.
    expect(where.OR).toContainEqual({ email: { in: ["a@b.com"] } });
  });

  it("matches Ben's shape: linked by customerId, no email on the member row", async () => {
    groupFindMany.mockResolvedValue([CLUB]);
    memberFindMany.mockResolvedValue([{ groupId: "g1", customerId: "ben", email: null, phone: null }]);
    const a = await resolveAutopilotAudience("r1", [{ customerId: "ben", email: "bbilton@gmail.com" }]);
    expect(a.match({ customerId: "ben", email: "bbilton@gmail.com" })).toEqual({
      groupName: "🍕Luigi's VIP Pizza Club",
      memberLabel: "VIP",
    });
  });

  it("matches a pasted-email member regardless of the typed casing", async () => {
    groupFindMany.mockResolvedValue([CLUB]);
    memberFindMany.mockResolvedValue([{ groupId: "g1", customerId: null, email: "guest@x.com", phone: null }]);
    const a = await resolveAutopilotAudience("r1", [{ email: "GUEST@X.com" }]);
    expect(a.match({ email: "GUEST@X.com" })?.groupName).toBe(CLUB.name);
    expect(a.match({ email: " guest@x.com " })?.groupName).toBe(CLUB.name);
  });

  it("matches a phone-only member (hand-typed contacts have no email)", async () => {
    groupFindMany.mockResolvedValue([CLUB]);
    memberFindMany.mockResolvedValue([{ groupId: "g1", customerId: null, email: null, phone: "4379916099" }]);
    const a = await resolveAutopilotAudience("r1", [{ phone: "4379916099" }]);
    expect(a.match({ phone: "4379916099" })?.groupName).toBe(CLUB.name);
  });

  it("leaves ordinary customers alone", async () => {
    groupFindMany.mockResolvedValue([CLUB]);
    memberFindMany.mockResolvedValue([{ groupId: "g1", customerId: "vip", email: null, phone: null }]);
    const a = await resolveAutopilotAudience("r1", [{ customerId: "vip" }, { customerId: "normal" }]);
    expect(a.match({ customerId: "normal" })).toBeNull();
    expect(a.matchedCount).toBe(1);
  });

  it("counts PEOPLE, not member rows — duplicates and multi-club don't inflate it", async () => {
    groupFindMany.mockResolvedValue([CLUB, { id: "g2", name: "Skool Founders", memberLabel: null }]);
    memberFindMany.mockResolvedValue([
      // Same person, added twice: once picked from the customer list, once pasted.
      { groupId: "g1", customerId: "c1", email: null, phone: null },
      { groupId: "g1", customerId: null, email: "one@x.com", phone: null },
      // ...and also in a second club.
      { groupId: "g2", customerId: "c1", email: null, phone: null },
    ]);
    const a = await resolveAutopilotAudience("r1", [{ customerId: "c1", email: "one@x.com" }]);
    expect(a.matchedCount).toBe(1);
  });

  it("degrades to 'nobody is a member' if the lookup throws — never mutes marketing", async () => {
    groupFindMany.mockRejectedValue(new Error("db down"));
    const a = await resolveAutopilotAudience("r1", [{ customerId: "c1" }]);
    expect(a.hasClubs).toBe(false);
    expect(a.match({ customerId: "c1" })).toBeNull();
  });
});

describe("vip mode plumbing", () => {
  it("defaults to the nudge-without-a-code behaviour Luigi chose", () => {
    expect(DEFAULT_VIP_MODE).toBe("no_offer");
  });

  it("normalises anything unrecognised rather than storing it raw", () => {
    expect(normalizeVipMode("offer")).toBe("offer");
    expect(normalizeVipMode("skip")).toBe("skip");
    expect(normalizeVipMode("no_offer")).toBe("no_offer");
    for (const junk of ["", "OFFER", "nonsense", null, undefined, 7, {}]) {
      expect(normalizeVipMode(junk)).toBe("no_offer");
    }
  });

  it("maps each campaign type to its own column, and nothing else", () => {
    expect(vipModeFieldFor("reengagement")).toBe("reEngageVipMode");
    expect(vipModeFieldFor("second_order")).toBe("secondOrderVipMode");
    expect(vipModeFieldFor("cart_abandonment")).toBe("cartAbandonVipMode");
    expect(vipModeFieldFor("something_else")).toBeNull();
  });
});
