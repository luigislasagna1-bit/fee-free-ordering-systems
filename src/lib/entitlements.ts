/**
 * Feature entitlement helper.
 *
 * Replaces ad-hoc "if plan === X" or "if subscriptionStatus === Y" checks with
 * a single function: given a restaurantId and a feature slug, return whether
 * the restaurant has access. The set of features a restaurant has is the
 * union of `enabledFeatures` across every active or trialing
 * `RestaurantAddOn` row.
 *
 * Phase 1 just builds the helper. Phase 5 starts calling `requireFeature()`
 * inside specific route handlers (e.g. the customer card-payment flow rejects
 * unless `card_payments` is in the entitlement set).
 */

import prisma from "@/lib/db";

/** All feature slugs the system knows about. New add-ons that unlock new
 *  features must add the slug here. The type union keeps callers honest. */
export type Feature =
  | "card_payments"
  | "stripe_connect"
  | "hosted_marketing_page"
  | "subdomain_routing"
  | "custom_domain_routing"
  | "customer_segmentation"
  | "automated_campaigns"
  | "app_store_listing"
  | "branded_pwa"
  | "in_house_pos"
  | "take_reservation_deposit"
  | "multi_location_management"
  /** Listed on the public Fee Free Ordering Marketplace at /marketplace.
   *  Granted by the "marketplace" add-on. Auto-creates a MarketplaceListing
   *  row on activation. */
  | "marketplace_listing"
  /** Access to the ShipDay third-party driver pool. Granted by EITHER
   *  the "marketplace" add-on (included) or the standalone "driver_pool"
   *  add-on. Surfaces the per-order "send to driver pool" option in
   *  the kitchen display. */
  | "driver_pool"
  /** Unlocks promo types 6-13 in the admin promotion wizard
   *  (Payment method reward, Free item, Meal bundle, Buy N get free,
   *  Free dish as part of meal, Fixed/Percentage discount on combo,
   *  Meal bundle with speciality). Granted by the `advanced_promos`
   *  add-on. Types 1-5 are FREE for every restaurant regardless of
   *  this entitlement. */
  | "advanced_promo_types"
  /** Sends transactional SMS to customers on order status changes
   *  (confirmed → accepted → ready → completed). Restaurant must
   *  subscribe to the `customer_sms` add-on at $19.99/month. Until
   *  active, sendSms() short-circuits to a no-op even when Twilio
   *  env vars are configured platform-wide. Granted by the
   *  `customer_sms` add-on. */
  | "customer_sms"
  /** Marketing Studio — trackable QR codes, smart links, and branded
   *  flyers/posters with scan→order→revenue analytics. Granted by the
   *  `marketing_studio` add-on. Free accounts see a locked upsell. */
  | "marketing_studio"
  /** Kickstarter launch-campaign tools. Granted by the `kickstarter`
   *  add-on. Free accounts see a locked upsell. */
  | "kickstarter"
  /** ContentPilot — the AI social media manager (auto-drafted posts,
   *  auto-scheduling, templates, fully automated mode). Granted by the
   *  `contentpilot` add-on; comingSoon until the feature ships. */
  | "contentpilot";

/** Statuses on RestaurantAddOn that grant entitlements. past_due / cancelled
 *  / incomplete subscriptions do NOT grant access — the feature drops the
 *  moment Stripe flips the status. "trialing" is kept on this list for
 *  legacy rows only; we no longer create trial subscriptions and our
 *  Stripe handler maps incoming "trialing" → "active" on receipt. */
const GRANTING_STATUSES = ["active", "trialing"] as const;

/** Returns true iff the restaurant has an active add-on whose
 *  enabledFeatures array contains the requested feature slug. */
export async function hasFeature(restaurantId: string, feature: Feature): Promise<boolean> {
  const features = await getEntitlements(restaurantId);
  return features.has(feature);
}

/** Returns true iff the restaurant has ANY active paid add-on row,
 *  regardless of what features that add-on unlocks. Used by the FREE
 *  plan order cap (src/lib/order-cap.ts) — any paying customer is
 *  exempt from the 100/month cap. We only check status, not
 *  monthlyPriceCents, because:
 *    - Free / promo / zero-cost add-ons still represent a paying
 *      relationship in our books once the owner subscribed.
 *    - Filtering by price would require an extra join + most add-ons
 *      cost more than $0 anyway.
 *  If we ever want to distinguish "actually paid > 0" from "free
 *  add-on," we'd add a separate `hasAnyBillableAddOn` helper. */
export async function hasAnyPaidAddOn(restaurantId: string): Promise<boolean> {
  const count = await prisma.restaurantAddOn.count({
    where: {
      restaurantId,
      status: { in: [...GRANTING_STATUSES] },
    },
  });
  return count > 0;
}

/** The bundle add-on slug. An active subscription to it grants the union of
 *  enabledFeatures across every AddOn flagged `inGrowthNet` — resolved live
 *  in getEntitlements, so newly-flagged add-ons reach existing subscribers
 *  automatically (Luigi 2026-06-11: GrowthNet keeps growing). */
export const GROWTHNET_SLUG = "growthnet";

/** Returns the full set of features this restaurant has unlocked. Useful
 *  for rendering UI (e.g. "all add-ons you have" page) and for bulk gating. */
export async function getEntitlements(restaurantId: string): Promise<Set<Feature>> {
  const rows = await prisma.restaurantAddOn.findMany({
    where: {
      restaurantId,
      status: { in: [...GRANTING_STATUSES] },
    },
    select: { addOn: { select: { slug: true, enabledFeatures: true } } },
  });

  const features = new Set<Feature>();
  const addFeatures = (json: string | null | undefined) => {
    let arr: unknown;
    try {
      arr = JSON.parse(json || "[]");
    } catch {
      return;
    }
    if (Array.isArray(arr)) {
      for (const f of arr) {
        if (typeof f === "string") features.add(f as Feature);
      }
    }
  };

  let hasGrowthNet = false;
  for (const row of rows) {
    if (row.addOn.slug === GROWTHNET_SLUG) hasGrowthNet = true;
    addFeatures(row.addOn.enabledFeatures);
  }

  // GrowthNet bundle: union in every member add-on's features. One extra
  // query, only for bundle subscribers — the AddOn catalog is a tiny table.
  // (If this ever sits on a hotter path than the admin layout, cache the
  // member-feature union; it changes only when the catalog changes.)
  if (hasGrowthNet) {
    const members = await prisma.addOn.findMany({
      where: { inGrowthNet: true, isActive: true },
      select: { enabledFeatures: true },
    });
    for (const m of members) addFeatures(m.enabledFeatures);
  }

  return features;
}

/** Throws with `status: 403` if the restaurant lacks the feature. Route
 *  handlers can catch this and return a clean Forbidden response, like the
 *  pattern used by `requireRestaurantAccess()` in src/lib/access.ts. */
export async function requireFeature(restaurantId: string, feature: Feature): Promise<void> {
  const ok = await hasFeature(restaurantId, feature);
  if (!ok) {
    const err = new Error(`Feature not unlocked: ${feature}`);
    (err as any).status = 403;
    (err as any).feature = feature;
    throw err;
  }
}

/** List of every Feature slug the type union knows about. Useful for tests
 *  and for "what features could this user theoretically have" UI surfaces. */
export const ALL_FEATURES: readonly Feature[] = [
  "card_payments",
  "stripe_connect",
  "hosted_marketing_page",
  "subdomain_routing",
  "custom_domain_routing",
  "customer_segmentation",
  "automated_campaigns",
  "app_store_listing",
  "branded_pwa",
  "in_house_pos",
  "take_reservation_deposit",
  "multi_location_management",
  "marketplace_listing",
  "driver_pool",
  "advanced_promo_types",
  "customer_sms",
  "marketing_studio",
  "kickstarter",
  "contentpilot",
];
