import type Stripe from "stripe";
import prisma from "@/lib/db";
import { sendTrialExpiringEmail } from "@/lib/email";

/**
 * Handle customer.subscription.* events.
 *
 * Stripe sends:
 *   - customer.subscription.created       (signup → first subscription row)
 *   - customer.subscription.updated       (plan change, trial → active, etc.)
 *   - customer.subscription.deleted       (cancelled)
 *   - customer.subscription.trial_will_end (3 days before trial ends — email reminder)
 *
 * We map status → Restaurant.subscriptionStatus and stash period end + cancel flag.
 */
export async function handleSubscriptionEvent(event: Stripe.Event) {
  const sub = event.data.object as Stripe.Subscription;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  const restaurant = await prisma.restaurant.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true, email: true, name: true, defaultLanguage: true },
  });
  if (!restaurant) {
    // Customer may have been deleted on our side; nothing to update.
    console.warn(`[stripe] subscription event for unknown customer ${customerId}`);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        subscriptionStatus: "cancelled",
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
      },
    });
    return;
  }

  if (event.type === "customer.subscription.trial_will_end") {
    // Stripe fires this 3 days before trial end. Nudge the owner to add a card.
    if (restaurant.email) {
      const trialEndSec = (sub as any).trial_end as number | undefined;
      const daysLeft = trialEndSec
        ? Math.max(0, Math.ceil((trialEndSec * 1000 - Date.now()) / (24 * 60 * 60 * 1000)))
        : 3;
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
      sendTrialExpiringEmail({
        to: restaurant.email,
        restaurantName: restaurant.name,
        daysLeft,
        upgradeUrl: `${baseUrl}/admin/billing`,
        locale: restaurant.defaultLanguage || "en",
      }).catch(() => {});
    }
    return;
  }

  // created / updated → upsert subscription state on Restaurant
  // Stripe.Subscription has current_period_end at the top level on legacy
  // API versions and inside `items.data[0]` on newer ones. Read both.
  const sAny = sub as any;
  const periodEndSec: number | undefined =
    sAny.current_period_end ?? sAny.items?.data?.[0]?.current_period_end;
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      subscriptionStatus: mapStripeStatus(sub.status),
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
  });
}

/** Map Stripe's subscription.status enum onto our local string set. */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "trialing": return "trialing";
    case "active": return "active";
    case "past_due": return "past_due";
    case "canceled": return "cancelled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "unpaid":
      return "past_due";
    case "paused":
      return "paused";
    default: return stripeStatus;
  }
}
