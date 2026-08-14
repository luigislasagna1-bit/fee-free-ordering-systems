/**
 * Competitive figures printed on partner collateral (Luigi 2026-08-14).
 *
 * ONE dated file, because these end up on PAPER handed to restaurant owners by third parties.
 * Inlining a number in a template means nobody can audit it later, and a stale claim on a
 * flyer is a claim we can't retract.
 *
 * ⚠️ DO NOT CONFUSE THESE TWO NUMBERS — a review pass already did:
 *   - THIRD_PARTY_MAX_COMMISSION_PCT (30) is what UberEats/DoorDash/Skip take from a
 *     restaurant. This is the number on the flyer.
 *   - TIER_RATES.tier3 (15) in src/lib/commission.ts is what WE pay a reseller. Different
 *     number, different direction, must never appear as "commission" on this collateral.
 */

/** Reviewed on this date. Re-check before any reprint push. */
export const COMPARISON_AS_OF = "2026-08-14";

/**
 * Upper bound of third-party marketplace commission on a delivery order, as publicly
 * advertised by the major aggregators' own merchant pricing pages (tiered plans top out
 * around 30% for delivery). Stated as "up to", which is what makes it defensible.
 */
export const THIRD_PARTY_MAX_COMMISSION_PCT = 30;

/** Illustrative basket used by the "what this costs you" maths on the funnel flyer. */
export const EXAMPLE_ORDER_TOTAL = 50;

/**
 * Global kill-switch for any asset that names a competitor. Templates carrying
 * `hasThirdPartyMarks` are hidden from the catalog when this is off, so a single env change
 * pulls every comparison asset without a code deploy.
 *
 * Nominative use of a competitor's NAME to make a truthful comparison is defensible; using
 * their LOGO is not. No template may render a competitor mark as an image.
 */
export function thirdPartyComparisonsEnabled(): boolean {
  return process.env.RESELLER_KIT_DISABLE_COMPARISONS !== "1";
}

/** Aggregators by country — Skip The Dishes is Canada-only, and naming it elsewhere reads as sloppy. */
export const AGGREGATORS_BY_COUNTRY: Record<string, string[]> = {
  CA: ["UberEats", "DoorDash", "SkipTheDishes"],
  US: ["UberEats", "DoorDash", "Grubhub"],
  GB: ["Uber Eats", "Deliveroo", "Just Eat"],
  IE: ["Uber Eats", "Deliveroo", "Just Eat"],
  AU: ["Uber Eats", "DoorDash", "Menulog"],
  IT: ["Uber Eats", "Deliveroo", "Glovo"],
  ES: ["Uber Eats", "Glovo", "Just Eat"],
  FR: ["Uber Eats", "Deliveroo"],
  DE: ["Lieferando", "Uber Eats", "Wolt"],
  NL: ["Thuisbezorgd", "Uber Eats"],
};

/** Aggregator names to print for a partner's country, with a safe generic default. */
export function aggregatorsFor(country: string | null): string[] {
  const key = (country ?? "").trim().toUpperCase();
  return AGGREGATORS_BY_COUNTRY[key] ?? ["Uber Eats", "DoorDash"];
}
