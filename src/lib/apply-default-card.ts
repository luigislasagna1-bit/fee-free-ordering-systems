/**
 * "Use this card for all my subscriptions" (Luigi 2026-07-11).
 *
 * Today, saving a card on the Billing page sets
 * `invoice_settings.default_payment_method` on the Stripe CUSTOMER — but
 * that customer-level default only auto-charges subscriptions that don't
 * carry their own pinned card, plus settlement invoices. Every add-on
 * subscription (and the platform subscription) pins whatever card was
 * used at ITS OWN checkout via Stripe's per-subscription
 * `default_payment_method`. Saving a NEW card therefore does not
 * repoint anything that already has a subscription running — Luigi
 * expected it would.
 *
 * This helper is the explicit action that closes that gap: it reads the
 * customer's CURRENT default payment method (never a client-supplied
 * one — the point is "the card I already saved", not an arbitrary id)
 * and points every one of the restaurant's live Stripe subscriptions
 * (the platform subscription + every RestaurantAddOn subscription) at
 * it, clearing whatever card each one was individually pinned to.
 *
 * Idempotent / safe to click twice: it always re-derives the target
 * payment method from the customer's current default and re-applies it;
 * updating a subscription to the same `default_payment_method` it
 * already has is a no-op on Stripe's side. Nothing here ever touches an
 * amount, so there's no double-charge risk either way.
 */
import prisma from "@/lib/db";
import { getStripe, stripeReady } from "@/lib/stripe";

export type ApplyDefaultCardResult =
  | { ok: true; updatedCount: number; totalCount: number }
  | { ok: false; error: "not_configured" | "no_customer" | "no_card" };

/**
 * @param restaurantId MUST come from the caller's session (see the
 *   `requireRestaurantAccess` check in the route handler) — never from
 *   client-supplied input. Every DB read/write below is scoped to this
 *   one restaurant, so one restaurant can never repoint another's
 *   subscriptions.
 */
export async function applyDefaultCardToAllSubscriptions(
  restaurantId: string,
): Promise<ApplyDefaultCardResult> {
  if (!(await stripeReady())) return { ok: false, error: "not_configured" };

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { stripeCustomerId: true, stripeSubscriptionId: true },
  });
  if (!restaurant?.stripeCustomerId) return { ok: false, error: "no_customer" };

  const stripe = await getStripe();
  const customer = await stripe.customers.retrieve(restaurant.stripeCustomerId, {
    expand: ["invoice_settings.default_payment_method"],
  });
  if ("deleted" in customer && customer.deleted) return { ok: false, error: "no_customer" };
  const defaultPm = (customer as any).invoice_settings?.default_payment_method;
  const pmId: string | null =
    typeof defaultPm === "string" ? defaultPm : defaultPm?.id ?? null;
  if (!pmId) return { ok: false, error: "no_card" };

  // Every subscription this restaurant has running: the platform
  // subscription (Restaurant.stripeSubscriptionId) plus every add-on
  // subscription (RestaurantAddOn.stripeSubscriptionId). Bounded — a
  // restaurant only ever has a handful of add-ons, never an unbounded
  // scan (findMany is already restaurantId-scoped via the @@index).
  const addOns = await prisma.restaurantAddOn.findMany({
    where: { restaurantId, stripeSubscriptionId: { not: null } },
    select: { stripeSubscriptionId: true },
  });

  const subscriptionIds = new Set<string>();
  for (const a of addOns) {
    if (a.stripeSubscriptionId) subscriptionIds.add(a.stripeSubscriptionId);
  }
  if (restaurant.stripeSubscriptionId) subscriptionIds.add(restaurant.stripeSubscriptionId);

  let updatedCount = 0;
  for (const subId of subscriptionIds) {
    try {
      await stripe.subscriptions.update(subId, { default_payment_method: pmId });
      updatedCount++;
    } catch (e) {
      // One bad/cancelled subscription id must not abort the rest —
      // log and keep going, same philosophy as notifyStaff's per-recipient
      // catch.
      console.error(
        `[applyDefaultCardToAllSubscriptions] failed to update subscription ${subId} for restaurant ${restaurantId}`,
        e,
      );
    }
  }

  return { ok: true, updatedCount, totalCount: subscriptionIds.size };
}
