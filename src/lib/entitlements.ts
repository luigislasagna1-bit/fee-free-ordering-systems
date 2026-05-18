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
  | "multi_location_management";

/** Statuses on RestaurantAddOn that grant entitlements. past_due / cancelled
 *  / incomplete subscriptions do NOT grant access — the feature drops the
 *  moment Stripe flips the status. */
const GRANTING_STATUSES = ["active", "trialing"] as const;

/** Returns true iff the restaurant has an active or trialing add-on whose
 *  enabledFeatures array contains the requested feature slug. */
export async function hasFeature(restaurantId: string, feature: Feature): Promise<boolean> {
  const features = await getEntitlements(restaurantId);
  return features.has(feature);
}

/** Returns the full set of features this restaurant has unlocked. Useful
 *  for rendering UI (e.g. "all add-ons you have" page) and for bulk gating. */
export async function getEntitlements(restaurantId: string): Promise<Set<Feature>> {
  const rows = await prisma.restaurantAddOn.findMany({
    where: {
      restaurantId,
      status: { in: [...GRANTING_STATUSES] },
    },
    select: { addOn: { select: { enabledFeatures: true } } },
  });

  const features = new Set<Feature>();
  for (const row of rows) {
    let arr: unknown;
    try {
      arr = JSON.parse(row.addOn.enabledFeatures || "[]");
    } catch {
      continue;
    }
    if (Array.isArray(arr)) {
      for (const f of arr) {
        if (typeof f === "string") features.add(f as Feature);
      }
    }
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
];
