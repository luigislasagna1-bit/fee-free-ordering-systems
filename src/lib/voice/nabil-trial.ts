/**
 * Nabil AI — the ONE-TIME 7-day free demo for restaurants that already pay us
 * (Luigi 2026-08-16, OWNER-ACTIONS A64 (d)).
 *
 * Rules, enforced here and nowhere else:
 *   1. only a restaurant with at least one ACTIVE, STRIPE-BILLED subscription
 *      (the platform plan or any add-on other than phone_ordering itself) is
 *      eligible — "already paying us for something". Complimentary rows
 *      (trialing, no Stripe sub), past_due-in-grace rows and the free plan do
 *      NOT count: none of them is a live payment.
 *   2. never twice: VoiceAgentConfig.trialUsedAt is stamped by the Stripe
 *      subscription webhook the moment the demo subscription exists
 *      (markNabilDemoUsed — a conditional write, so a retried webhook cannot
 *      re-stamp and an abandoned Checkout never burns the demo).
 *
 * The add-on Checkout route (src/app/api/admin/add-ons/checkout/route.ts)
 * asks isNabilDemoEligible() and, when eligible, passes
 * subscription_data.trial_period_days = NABIL_DEMO_DAYS + stamps
 * subscription metadata[NABIL_DEMO_METADATA_KEY] so the webhook knows this
 * subscription IS the demo.
 *
 * Why not reuse hasAnyPaidAddOn (src/lib/entitlements.ts): it answers "does
 * this store have a GRANTING add-on row" for the free-plan order cap — it
 * counts complimentary and grace rows on purpose. This helper needs live money.
 */
import prisma from "@/lib/db";
import { NABIL_DEMO_DAYS } from "@/lib/voice/nabil-billing";

export { NABIL_DEMO_DAYS };

/** Add-on slug of Nabil AI in the catalog. */
export const PHONE_ORDERING_ADDON_SLUG = "phone_ordering";

/** Stripe subscription metadata key stamped on a demo subscription. */
export const NABIL_DEMO_METADATA_KEY = "nabilDemoDays";

export type NabilDemoIneligibleReason = "not_paying" | "already_used";

export type NabilDemoEligibility =
  | { eligible: true; days: number }
  | { eligible: false; reason: NabilDemoIneligibleReason };

/**
 * True iff the restaurant currently pays us through Stripe for something other
 * than Nabil AI itself: an active platform plan subscription, or any active
 * add-on subscription with a Stripe subscription id.
 */
export async function hasActivePaidSubscription(restaurantId: string): Promise<boolean> {
  const [restaurant, paidAddOns] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { subscriptionStatus: true, stripeSubscriptionId: true },
    }),
    prisma.restaurantAddOn.count({
      where: {
        restaurantId,
        status: "active",
        stripeSubscriptionId: { not: null },
        addOn: { slug: { not: PHONE_ORDERING_ADDON_SLUG } },
      },
    }),
  ]);
  const paidPlan = !!restaurant && restaurant.subscriptionStatus === "active" && !!restaurant.stripeSubscriptionId;
  return paidPlan || paidAddOns > 0;
}

/** Has this restaurant already used its one-time demo? */
export async function nabilDemoAlreadyUsed(restaurantId: string): Promise<boolean> {
  const cfg = await prisma.voiceAgentConfig.findUnique({
    where: { restaurantId },
    select: { trialUsedAt: true },
  });
  return !!cfg?.trialUsedAt;
}

/** The decision the Checkout route (and the add-ons card badge) reads. */
export async function isNabilDemoEligible(restaurantId: string): Promise<NabilDemoEligibility> {
  const [paying, used] = await Promise.all([
    hasActivePaidSubscription(restaurantId),
    nabilDemoAlreadyUsed(restaurantId),
  ]);
  if (used) return { eligible: false, reason: "already_used" };
  if (!paying) return { eligible: false, reason: "not_paying" };
  return { eligible: true, days: NABIL_DEMO_DAYS };
}

/**
 * Stamp trialUsedAt ONCE. Idempotent by construction: the config row is
 * created if missing (upsert with an empty update), then the timestamp is
 * written only where it is still null. Returns true when THIS call stamped it.
 * Called from the Stripe subscription webhook — a retried event is a no-op.
 */
export async function markNabilDemoUsed(restaurantId: string, at: Date = new Date()): Promise<boolean> {
  await prisma.voiceAgentConfig.upsert({
    where: { restaurantId },
    create: { restaurantId, trialUsedAt: at },
    update: {},
  });
  const res = await prisma.voiceAgentConfig.updateMany({
    where: { restaurantId, trialUsedAt: null },
    data: { trialUsedAt: at },
  });
  return res.count > 0;
}

/**
 * Does this Stripe subscription carry our demo marker? The Checkout route
 * stamps metadata[NABIL_DEMO_METADATA_KEY] = "7"; anything else (including a
 * complimentary-conversion trial_end, which is NOT the demo) is false.
 */
export function subscriptionIsNabilDemo(metadata: Record<string, string> | null | undefined): boolean {
  const v = metadata?.[NABIL_DEMO_METADATA_KEY];
  return typeof v === "string" && /^\d+$/.test(v) && Number(v) > 0;
}
