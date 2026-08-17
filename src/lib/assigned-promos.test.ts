/**
 * The day-one backfill for Promotion.phoneOrders (scripts/backfill-promo-phone-
 * orders.ts) sets phoneOrders=false EXACTLY where the retired hardcoded
 * "online-only campaign" rule matched — so behaviour was byte-identical the day
 * the per-promo switch shipped (Luigi A64(a), 2026-08-17). These tests pin:
 *   1. the predicate (`isOnlineOnlyCampaignRef`) to today's concrete campaignRef
 *      set — every Kickstarter + Autopilot ref, and NONE of the owner-made /
 *      assigned ones;
 *   2. the SQL side the script queries with (`onlineOnlyCampaignRefWhere`) to the
 *      predicate, over the same fixture — the two must select the same rows.
 */
import { describe, it, expect } from "vitest";
import {
  isOnlineOnlyCampaignRef,
  onlineOnlyCampaignRefWhere,
  ONLINE_ONLY_CAMPAIGN_REF_PREFIXES,
  isAssignedCampaignRef,
  KICKSTARTER_FIRST_BUY_REF,
} from "./assigned-promos";

/** Every campaignRef the campaigns mint today (kickstarter.ts, autopilot-promos.ts). */
const CAMPAIGN_REFS_TODAY = [
  KICKSTARTER_FIRST_BUY_REF, // "kickstarter_first_buy"
  "kickstarter_invite_prospects",
  "autopilot_2nd_order",
  "autopilot_reengage_win1",
  "autopilot_reengage_win2",
  "autopilot_reengage_win3",
  "autopilot_reengage_win4",
  "autopilot_reengage_win5",
  "autopilot_cart_recovery",
];

/** Rows the backfill must leave at the default (phoneOrders=true). */
const NOT_CAMPAIGN_REFS = [
  null,
  undefined,
  "",
  "assigned_manual",
  "assigned_group:cmx123",
  "owner_lunch_special",
  "vip_friday",
  "KICKSTARTER_FIRST_BUY", // case matters — the campaigns mint lowercase
  " autopilot_2nd_order", // never stored with whitespace; must not match by accident
];

/** Simulate Prisma's `campaignRef: { startsWith }` inside an OR. */
function whereMatches(campaignRef: string | null | undefined): boolean {
  const { OR } = onlineOnlyCampaignRefWhere();
  return OR.some((c) => typeof campaignRef === "string" && campaignRef.startsWith(c.campaignRef.startsWith));
}

describe("backfill rule = today's isOnlineOnlyCampaignRef set", () => {
  it("prefixes are exactly kickstarter + autopilot", () => {
    expect([...ONLINE_ONLY_CAMPAIGN_REF_PREFIXES]).toEqual(["kickstarter", "autopilot"]);
  });

  it("every campaign ref minted today is matched (→ phoneOrders=false)", () => {
    for (const ref of CAMPAIGN_REFS_TODAY) {
      expect(isOnlineOnlyCampaignRef(ref), ref).toBe(true);
      expect(whereMatches(ref), ref).toBe(true);
    }
  });

  it("owner-made, assigned (1:1 / VIP group) and null refs are NOT matched (→ stay phoneOrders=true)", () => {
    for (const ref of NOT_CAMPAIGN_REFS) {
      expect(isOnlineOnlyCampaignRef(ref), String(ref)).toBe(false);
      expect(whereMatches(ref), String(ref)).toBe(false);
    }
  });

  it("the SQL where-fragment and the in-code predicate select the same rows (the script applies both)", () => {
    for (const ref of [...CAMPAIGN_REFS_TODAY, ...NOT_CAMPAIGN_REFS]) {
      expect(whereMatches(ref), String(ref)).toBe(isOnlineOnlyCampaignRef(ref));
    }
  });

  it("assigned gifts are never campaign promos (the two classifications are disjoint)", () => {
    for (const ref of [...CAMPAIGN_REFS_TODAY, ...NOT_CAMPAIGN_REFS]) {
      expect(isAssignedCampaignRef(ref) && isOnlineOnlyCampaignRef(ref), String(ref)).toBe(false);
    }
  });
});
