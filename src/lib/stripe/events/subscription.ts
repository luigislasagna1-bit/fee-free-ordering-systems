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

  // Branch 1b: reseller white-label subscription — /api/reseller/subscribe
  // stamps subscription_data.metadata.whiteLabelTier + resellerProfileId.
  // Identified via metadata rather than customer-lookup because reseller
  // stripeCustomerId lives on ResellerProfile, not Restaurant.
  const whiteLabelTier = (sub.metadata as any)?.whiteLabelTier as string | undefined;
  const whiteLabelResellerProfileId = (sub.metadata as any)?.resellerProfileId as string | undefined;
  if (whiteLabelTier && whiteLabelResellerProfileId) {
    await handleResellerWhiteLabelEvent(event, sub, whiteLabelTier, whiteLabelResellerProfileId);
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
      // IMPORTANT: await — Vercel kills unawaited promises after webhook 200.
      try {
        await sendTrialExpiringEmail({
          to: restaurant.email,
          restaurantName: restaurant.name,
          daysLeft,
          upgradeUrl: `${baseUrl}/admin/billing`,
          locale: restaurant.defaultLanguage || "en",
        });
      } catch (e) {
        console.error("[stripe/subscription.trial_will_end] trial email failed", e);
      }
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
  if (addOn.slug === "marketplace") {
    if (isActive) {
      // Marketplace listing auto-creation: the moment the customer's
      // marketplace subscription activates, they appear on /marketplace
      // with sensible defaults (tagline = restaurant slogan, banner =
      // restaurant banner, etc.). They can fine-tune in /admin/marketplace.
      // Also flip billingMode to "monthly" — restaurants on the flat
      // plan are NOT settled per-order by the monthly settlement cron.
      try {
        await ensureMarketplaceListing(restaurantId);
        await prisma.marketplaceListing.update({
          where: { restaurantId },
          data: { billingMode: "monthly" },
        });
      } catch (e) {
        console.error("[stripe] marketplace activation side-effects failed:", e);
      }
    } else {
      // Monthly subscription ended (cancelled / past-due / expired). The
      // listing row stays for historical / counter data, but we:
      //   - HIDE it (isListed=false) so it disappears from the public
      //     marketplace immediately — no surprise discovery while the
      //     restaurant figures out their next step.
      //   - Flip billingMode back to "payg" as the safe default. The
      //     restaurant has to RE-VISIT /admin/marketplace to re-list:
      //     they'll see the locked view with both plan choices and
      //     either re-subscribe to monthly or explicitly opt into PAYG.
      // This prevents the silent "I cancelled but I'm still being
      // billed per order" surprise — they can't accrue PAYG fees while
      // hidden from the marketplace (no marketplace orders → no $3 charges).
      try {
        await prisma.marketplaceListing.updateMany({
          where: { restaurantId },
          data: { billingMode: "payg", isListed: false },
        });
      } catch (e) {
        console.error("[stripe] marketplace deactivation failed:", e);
      }
    }
  }
}

/**
 * Reseller white-label subscription handler. Mirrors the AddOn path but
 * targets ResellerProfile instead of Restaurant. Sub identified by
 * metadata.resellerProfileId + metadata.whiteLabelTier (set in
 * /api/reseller/subscribe).
 *
 * State transitions we care about:
 *   created/updated.status=active   → set tier + status="active"
 *   created/updated.status=past_due → set status="past_due" (keep tier)
 *   deleted                          → clear tier + status="cancelled"
 *
 * Once status != "active", the imprint + logo stop flowing into emails
 * (gate is in notifications.ts resolveImprint, added in a separate edit).
 */
async function handleResellerWhiteLabelEvent(
  event: Stripe.Event,
  sub: Stripe.Subscription,
  whiteLabelTier: string,
  resellerProfileId: string,
) {
  const profile = await prisma.resellerProfile.findUnique({
    where: { id: resellerProfileId },
    select: { id: true },
  });
  if (!profile) {
    console.warn(`[stripe] white-label event for unknown reseller ${resellerProfileId}`);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    await prisma.resellerProfile.update({
      where: { id: resellerProfileId },
      data: {
        whiteLabelTier: null,
        whiteLabelStatus: "cancelled",
        whiteLabelStripeSubscriptionId: null,
        whiteLabelCancelAtPeriodEnd: false,
      },
    });
    return;
  }

  // created / updated → upsert state
  const status = mapStripeStatus(sub.status);
  // Period end: newer Stripe API versions put it inside items.data[0].
  // Read both to be safe across versions.
  const periodEndSec =
    (sub as any).current_period_end ??
    (sub as any).items?.data?.[0]?.current_period_end;
  await prisma.resellerProfile.update({
    where: { id: resellerProfileId },
    data: {
      whiteLabelTier: whiteLabelTier === "basic" || whiteLabelTier === "full" ? whiteLabelTier : null,
      whiteLabelStatus: status,
      whiteLabelStripeSubscriptionId: sub.id,
      whiteLabelCurrentPeriodEnd: periodEndSec
        ? new Date(periodEndSec * 1000)
        : null,
      whiteLabelCancelAtPeriodEnd: (sub as any).cancel_at_period_end ?? false,
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
