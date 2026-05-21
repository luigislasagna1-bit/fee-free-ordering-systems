/**
 * Marketplace eligibility checks.
 *
 * Before a restaurant can opt into ANY marketplace plan (monthly or
 * PAYG), they must have a coherent delivery setup. The rule:
 *
 *   - If acceptsDelivery is false → they're pickup-only on the
 *     marketplace too. No driver question. ALLOWED.
 *   - If acceptsDelivery is true AND ShipdayConfig.deliverySource is
 *     "own" → store-managed deliveries only, no ShipDay needed. ALLOWED.
 *   - If acceptsDelivery is true AND deliverySource is "shipday" or
 *     "both" → they need the `driver_pool` entitlement BEFORE signup.
 *     The Driver Pool feature is granted by either:
 *       (a) The standalone Driver Pool add-on ($19.99/mo), OR
 *       (b) The Marketplace Monthly add-on (bundles Driver Pool free).
 *     For PAYG marketplace signup, only (a) qualifies — they need to
 *     subscribe to standalone Driver Pool first.
 *
 * Returns a structured result so the caller can render the right
 * "what's missing" message + CTA.
 */

import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";

export type MarketplaceEligibility = {
  /** True iff the restaurant can subscribe to a marketplace plan right now. */
  eligible: boolean;
  /** Machine-readable reason when ineligible. */
  reason:
    | null
    | "not_published"               // restaurant hasn't completed setup + published yet
    | "needs_delivery_source_set"   // acceptsDelivery=true but no ShipdayConfig
    | "needs_driver_pool"           // deliverySource needs ShipDay but no entitlement
    | "needs_online_payments"       // marketplace orders MUST be paid online
    | "needs_stripe_connect";        // online_payments active but Stripe Connect not live
  /** Human label of the current delivery source for UI display. */
  deliverySource: "own" | "shipday" | "both" | "not_set";
  acceptsDelivery: boolean;
  hasDriverPoolEntitlement: boolean;
  hasCardPaymentsEntitlement: boolean;
  stripeConnectLive: boolean;
  /** What the operator needs to do, in plain English. Used as the
   *  body of the "blocked" callout on the signup pages. */
  blockerMessage: string | null;
  /** Where to send them to fix the blocker. */
  blockerHref: string | null;
};

/**
 * Compute eligibility for a marketplace plan. `forPlan` lets the
 * caller distinguish between "monthly" (Marketplace Monthly bundles
 * Driver Pool, so subscribing satisfies the gate automatically — we
 * still warn if delivery setup is incomplete) and "payg" (no bundle,
 * standalone Driver Pool subscription required upfront).
 */
export async function getMarketplaceEligibility(
  restaurantId: string,
  forPlan: "monthly" | "payg",
): Promise<MarketplaceEligibility> {
  const [restaurant, shipdayConfig, hasDriverPool, hasCardPayments] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        acceptsDelivery: true,
        publishedAt: true,
        stripeAccountStatus: true,
        stripeChargesEnabled: true,
      },
    }),
    prisma.shipdayConfig.findUnique({
      where: { restaurantId },
      select: { deliverySource: true, enabled: true },
    }),
    hasFeature(restaurantId, "driver_pool"),
    hasFeature(restaurantId, "card_payments"),
  ]);

  const acceptsDelivery = !!restaurant?.acceptsDelivery;
  const stripeConnectLive = !!(
    restaurant?.stripeAccountStatus === "connected" && restaurant?.stripeChargesEnabled
  );

  // FIRST gate (before all others): the restaurant must be published.
  // Unpublished restaurants can't actually receive customer orders, so
  // putting them on the public marketplace would just frustrate customers
  // who click through and hit a 404. Publishing requires completing every
  // required setup step (menu, hours, services, etc.), so this single
  // check guarantees they're operationally ready.
  if (!restaurant?.publishedAt) {
    return {
      eligible: false,
      reason: "not_published",
      deliverySource: "not_set",
      acceptsDelivery,
      hasDriverPoolEntitlement: hasDriverPool,
      hasCardPaymentsEntitlement: hasCardPayments,
      stripeConnectLive,
      blockerMessage:
        "Finish your restaurant setup and publish before joining the marketplace. " +
        "Customers browsing the marketplace expect to order immediately — an unpublished " +
        "restaurant can't accept those orders. Complete the setup wizard first.",
      blockerHref: "/admin/setup",
    };
  }
  const sourceRaw = shipdayConfig?.deliverySource;
  const deliverySource =
    sourceRaw === "own" || sourceRaw === "shipday" || sourceRaw === "both"
      ? sourceRaw
      : "not_set";

  // FIRST gate: marketplace orders MUST be paid online. The customer
  // checkout flow forces card payment when the order originates from
  // the marketplace, so the restaurant has to (a) own the card_payments
  // entitlement (Online Payments add-on active) AND (b) have completed
  // Stripe Connect onboarding. Without both, marketplace orders can't
  // actually charge — which would deadlock the kitchen.
  if (!hasCardPayments) {
    return {
      eligible: false,
      reason: "needs_online_payments",
      deliverySource,
      acceptsDelivery,
      hasDriverPoolEntitlement: hasDriverPool,
      hasCardPaymentsEntitlement: false,
      stripeConnectLive,
      blockerMessage:
        "Marketplace orders are always paid online by card — no cash, no pay-at-pickup. " +
        "You need the Online Payments add-on active before joining the marketplace. " +
        "Subscribe to Online Payments first, then come back.",
      blockerHref: "/admin/billing/add-ons",
    };
  }
  if (!stripeConnectLive) {
    return {
      eligible: false,
      reason: "needs_stripe_connect",
      deliverySource,
      acceptsDelivery,
      hasDriverPoolEntitlement: hasDriverPool,
      hasCardPaymentsEntitlement: true,
      stripeConnectLive: false,
      blockerMessage:
        "Online Payments is active, but Stripe Connect onboarding isn't complete — " +
        "money has nowhere to land. Finish Stripe Connect setup before joining the marketplace.",
      blockerHref: "/admin/payments/providers",
    };
  }

  // No-delivery / pickup-only restaurants pass through unconditionally.
  // The "managed delivery" choice is moot when there's no delivery.
  if (!acceptsDelivery) {
    return {
      eligible: true,
      reason: null,
      deliverySource: "not_set",
      acceptsDelivery: false,
      hasDriverPoolEntitlement: hasDriverPool,
      hasCardPaymentsEntitlement: true,
      stripeConnectLive: true,
      blockerMessage: null,
      blockerHref: null,
    };
  }

  // Delivery enabled but ShipdayConfig is missing entirely → owner
  // hasn't visited /admin/delivery/pool yet to make the explicit
  // delivery management choice. Force them to make it before joining
  // the marketplace — otherwise we'd auto-default to "own" without
  // their confirmation, and a restaurant that actually intends to use
  // ShipDay would end up with marketplace orders they can't dispatch.
  if (deliverySource === "not_set") {
    return {
      eligible: false,
      reason: "needs_delivery_source_set",
      deliverySource: "not_set",
      acceptsDelivery: true,
      hasDriverPoolEntitlement: hasDriverPool,
      hasCardPaymentsEntitlement: true,
      stripeConnectLive: true,
      blockerMessage:
        "Choose how you manage deliveries (own drivers, ShipDay pool, or both) before joining the marketplace. " +
        "Visit Driver Pool settings to pick one — it's required even if you stick with your own in-house drivers.",
      blockerHref: "/admin/delivery/pool",
    };
  }
  if (deliverySource === "own") {
    return {
      eligible: true,
      reason: null,
      deliverySource: "own",
      acceptsDelivery: true,
      hasDriverPoolEntitlement: hasDriverPool,
      hasCardPaymentsEntitlement: true,
      stripeConnectLive: true,
      blockerMessage: null,
      blockerHref: null,
    };
  }

  // deliverySource is "shipday" or "both" — needs Driver Pool.
  // For monthly: the Marketplace Monthly subscription bundles it, so
  // technically a fresh subscription satisfies the requirement. But
  // we WARN here so they don't end up subscribed without realizing
  // Driver Pool was the reason. For PAYG: standalone Driver Pool
  // must already be active before opt-in.
  if (!hasDriverPool) {
    return {
      eligible: false,
      reason: "needs_driver_pool",
      deliverySource,
      acceptsDelivery: true,
      hasDriverPoolEntitlement: false,
      hasCardPaymentsEntitlement: true,
      stripeConnectLive: true,
      blockerMessage:
        forPlan === "payg"
          ? `Your delivery source is set to "${humanSource(deliverySource)}" — you need an active ShipDay Driver Pool subscription before joining Pay-As-You-Go marketplace. Subscribe to Driver Pool ($19.99/mo) first, then come back here.`
          : `Your delivery source is set to "${humanSource(deliverySource)}". The Marketplace Monthly plan bundles Driver Pool for free, so subscribing here is the cheapest path. Or you can switch your delivery source to "Own drivers" at /admin/delivery/pool and re-check.`,
      blockerHref:
        forPlan === "payg"
          ? "/admin/billing/add-ons"
          : "/admin/delivery/pool",
    };
  }

  return {
    eligible: true,
    reason: null,
    deliverySource,
    acceptsDelivery: true,
    hasDriverPoolEntitlement: true,
    hasCardPaymentsEntitlement: true,
    stripeConnectLive: true,
    blockerMessage: null,
    blockerHref: null,
  };
}

function humanSource(s: "shipday" | "both"): string {
  return s === "shipday" ? "ShipDay only" : "Own + ShipDay (both)";
}
