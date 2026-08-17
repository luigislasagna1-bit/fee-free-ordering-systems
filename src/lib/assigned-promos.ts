/**
 * Which promo rows are PERSONALLY ASSIGNED (1:1 gift or VIP-group) vs. openly
 * broadcast (Kickstarter FIRSTBUY, Autopilot WIN1…, owner-made codes).
 *
 * This distinction is load-bearing, not cosmetic. A personally-assigned code
 * belongs to one named customer, so typing it with someone else's email must be
 * refused ("registered to a different email address"). A BROADCAST code is meant
 * to be typed by anyone who received the email — refusing it there is a bug that
 * blocks the checkout outright.
 *
 * 🚨 Why this file exists (Luigi 2026-08-14): `resolveAssignedPromoByCode` used
 * to decide "is this code assigned?" purely by asking whether ANY CustomerCoupon
 * row carried the code. But `recordAppliedCoupons` writes such a row for every
 * order that redeems a TRACKABLE promo (campaignRef set OR onceLifetimePerClient)
 * — which includes FIRSTBUY. So a customer who redeemed FIRSTBUY left behind a
 * row stamped with THEIR email, and later customers who typed the code matched
 * that row, failed the identity check, and got a hard 400 at checkout — the
 * whole order rejected, not just the discount lost.
 *
 * It struck only SOME customers, which is why it went unnoticed. The lookup
 * matches statuses {granted, released, applied} but NOT redeemed, so:
 *   - order COMPLETES  → redeemed → stops poisoning (the common, happy path)
 *   - order MISSED / rejected / cancelled → released → poisons the code FOREVER
 *   - order still in flight → applied → poisons it until that order resolves
 * So every abandoned or auto-rejected FIRSTBUY order left a permanent landmine,
 * and each in-flight one left a temporary one. Intermittent by construction.
 *
 * The ownership check must therefore key off what the PROMOTION is, not off the
 * incidental existence of a ledger row. `campaignRef` already carries that:
 * assign-to-customer stamps "assigned_manual", VIP-group assignment stamps
 * "assigned_group:<id>", and the Promotions UI has always split its Assigned tab
 * on exactly this rule.
 *
 * Client-safe on purpose (no prisma import) so the server ledger and the admin
 * Promotions list share ONE definition and can't drift apart.
 */

/** campaignRef prefixes that mark a promo as personally/group assigned. */
export const ASSIGNED_CAMPAIGN_REF_PREFIXES = ["assigned_manual", "assigned_group"] as const;

/**
 * True for a promo that was handed to a SPECIFIC customer (or a specific VIP
 * group) — the only kind whose coupon code is identity-bound.
 *
 * False for every broadcast code: null/owner-made, "kickstarter_first_buy",
 * "autopilot_*". Those are meant to be typed by anyone who got the email.
 */
export function isAssignedCampaignRef(campaignRef: string | null | undefined): boolean {
  return !!campaignRef && ASSIGNED_CAMPAIGN_REF_PREFIXES.some((p) => campaignRef.startsWith(p));
}

/**
 * campaignRef tag of the Kickstarter First Buy promo row (10% off the first
 * order, code FIRSTBUY). Lives here (client-safe, no prisma) and is re-exported
 * by `kickstarter.ts`; use the constant, never the bare string.
 */
export const KICKSTARTER_FIRST_BUY_REF = "kickstarter_first_buy";

/** campaignRef prefixes of the EMAIL-CAMPAIGN promos (Kickstarter first-buy /
 *  invite-prospects, Autopilot 2nd-order / re-engage WIN1..5 / cart-recovery). */
export const ONLINE_ONLY_CAMPAIGN_REF_PREFIXES = ["kickstarter", "autopilot"] as const;

/**
 * True for a promo minted by the Kickstarter or Autopilot email campaigns.
 *
 * ⚠️ NO LONGER READ BY THE PROMO ENGINE. Until 2026-08-17 this was the
 * hardcoded rule that kept these promos off Nabil phone orders (Luigi
 * 2026-08-16: "Do NOT offer any kickstarter discounts over the phone — those
 * are online only"; live defect ORD-971682861). Luigi then made phone
 * availability a PER-PROMO SETTING for every store and every promo type —
 * `Promotion.phoneOrders`, "Available by phone (Nabil AI)" in the promo editor
 * — read by the shared isEligible() gate (src/lib/promo-engine.ts,
 * `phoneOrdersOk`) and the shared promo pool (src/lib/promo-order-context.ts).
 *
 * This function survives ONLY as the day-one backfill's definition
 * (scripts/backfill-promo-phone-orders.ts sets phoneOrders=false exactly where
 * it returns true, so behaviour was byte-identical on the day the setting
 * shipped) and as the natural default for campaign creators that want new
 * campaign rows to start phone-excluded. Do not reintroduce it as a runtime
 * gate — the column is the truth now, and the owner can flip it.
 *
 * False for null/owner-made promos and for assigned_manual / assigned_group.
 */
export function isOnlineOnlyCampaignRef(campaignRef: string | null | undefined): boolean {
  return !!campaignRef && ONLINE_ONLY_CAMPAIGN_REF_PREFIXES.some((p) => campaignRef.startsWith(p));
}

/**
 * The Prisma where-fragment that selects EXACTLY the rows
 * `isOnlineOnlyCampaignRef` is true for — the day-one backfill's query
 * (scripts/backfill-promo-phone-orders.ts). Kept next to the predicate so the
 * SQL side and the in-code side can't drift; the backfill applies both.
 */
export function onlineOnlyCampaignRefWhere(): { OR: Array<{ campaignRef: { startsWith: string } }> } {
  return { OR: ONLINE_ONLY_CAMPAIGN_REF_PREFIXES.map((p) => ({ campaignRef: { startsWith: p } })) };
}
