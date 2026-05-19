import type Stripe from "stripe";
import prisma from "@/lib/db";
import { sendTrialExpiringEmail } from "@/lib/email";
import { ensureMarketplaceListing } from "@/lib/marketplace";

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

  // Branch 1: add-on subscription — Stripe Checkout for an AddOn stamps
  // subscription_data.metadata.addOnSlug. When present, this sub belongs to
  // RestaurantAddOn, not the platform plan, so we route to the add-on
  // handler and skip the legacy plan update entirely.
  const addOnSlug = (sub.metadata as any)?.addOnSlug as string | undefined;
  const addOnRestaurantId = (sub.metadata as any)?.restaurantId as string | undefined;
  if (addOnSlug) {
    await handleAddOnSubscriptionEvent(event, sub, addOnSlug, addOnRestaurantId);
    return;
  }

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

/**
 * Mirror Stripe lifecycle into the RestaurantAddOn row. The Checkout
 * session put `addOnSlug` + `restaurantId` into subscription.metadata so
 * we can find the right row without a customer lookup.
 */
async function handleAddOnSubscriptionEvent(
  event: Stripe.Event,
  sub: Stripe.Subscription,
  addOnSlug: string,
  restaurantIdHint?: string
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

  // Find AddOn row (by slug — metadata is authoritative).
  const addOn = await prisma.addOn.findUnique({ where: { slug: addOnSlug } });
  if (!addOn) {
    console.warn(`[stripe] add-on subscription for unknown slug ${addOnSlug}`);
    return;
  }

  // Resolve restaurant from metadata or by stripeCustomerId.
  let restaurantId = restaurantIdHint || null;
  if (!restaurantId) {
    const r = await prisma.restaurant.findUnique({
      where: { stripeCustomerId: customerId },
      select: { id: true },
    });
    if (r) restaurantId = r.id;
  }
  if (!restaurantId) {
    console.warn(`[stripe] add-on subscription has no resolvable restaurant (customer=${customerId})`);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await prisma.restaurantAddOn.updateMany({
      where: { restaurantId, addOnId: addOn.id },
      data: {
        status: "cancelled",
        cancelAtPeriodEnd: false,
      },
    });
    return;
  }

  const sAny = sub as any;
  const periodEndSec: number | undefined =
    sAny.current_period_end ?? sAny.items?.data?.[0]?.current_period_end;
  const trialEndSec = sAny.trial_end as number | undefined;
  const status = mapStripeStatus(sub.status);

  await prisma.restaurantAddOn.upsert({
    where: { restaurantId_addOnId: { restaurantId, addOnId: addOn.id } },
    create: {
      restaurantId,
      addOnId: addOn.id,
      status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      trialEndsAt: trialEndSec ? new Date(trialEndSec * 1000) : null,
      activatedAt: new Date(),
    },
    update: {
      status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      trialEndsAt: trialEndSec ? new Date(trialEndSec * 1000) : null,
    },
  });

  // ── Side effects on activation ───────────────────────────────────────
  // When specific add-ons go active/trialing, create the related rows so
  // the customer-facing UI lights up immediately instead of waiting for
  // a first admin-page visit. Idempotent helpers — safe on Stripe retries.
  const isActive = status === "active" || status === "trialing";
  if (isActive && addOn.slug === "marketplace") {
    // Marketplace listing auto-creation: the moment the customer's
    // marketplace subscription activates, they appear on /marketplace
    // with sensible defaults (tagline = restaurant slogan, banner =
    // restaurant banner, etc.). They can fine-tune in /admin/marketplace.
    ensureMarketplaceListing(restaurantId).catch((e) =>
      console.error("[stripe] ensureMarketplaceListing failed:", e),
    );
  }
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
