import type Stripe from "stripe";
import prisma from "@/lib/db";
import { ensureMarketplaceListing } from "@/lib/marketplace";
import { notifyAddOnChange } from "@/lib/platform-notifications";
import { graceDeadline, startRestaurantGrace, clearRestaurantGraceIfHealthy } from "@/lib/dunning";
import { ensureResellerGenericSubdomain } from "@/lib/reseller-subdomain";

/**
 * Handle customer.subscription.* events.
 *
 * Stripe sends:
 *   - customer.subscription.created       (signup → first subscription row)
 *   - customer.subscription.updated       (plan change, status flip, etc.)
 *   - customer.subscription.deleted       (cancelled)
 *   - customer.subscription.trial_will_end (legacy — we drop these now; we
 *                                           no longer create trials)
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
    // We no longer create trials, so this event shouldn't fire for any
    // subscription we created. Drop on the floor — kept here only so the
    // webhook handler explicitly acknowledges the event type instead of
    // logging "unhandled". Legacy subscriptions that still emit this
    // were grandfathered: they're still on the platform but their
    // "trial" is effectively a FREE plan now.
    return;
  }

  // created / updated → upsert subscription state on Restaurant
  // Stripe.Subscription has current_period_end at the top level on legacy
  // API versions and inside `items.data[0]` on newer ones. Read both.
  const sAny = sub as any;
  const periodEndSec: number | undefined =
    sAny.current_period_end ?? sAny.items?.data?.[0]?.current_period_end;
  const platformStatus = mapStripeStatus(sub.status);
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      subscriptionStatus: platformStatus,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
  });
  // Platform recovery — when the plan reads healthy again, release the shared
  // dunning grace clock if nothing else is failing. Covers event orderings
  // where invoice.paid processed BEFORE stripeSubscriptionId was stamped (so
  // its platform-scoped writes were skipped). No-ops when no clock is running.
  if (platformStatus === "active") {
    try {
      await clearRestaurantGraceIfHealthy(restaurant.id);
    } catch (e) {
      console.error("[stripe/subscription] clearRestaurantGraceIfHealthy failed", e);
    }
  }
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

  // Read the PRIOR state before we mutate so we can fire platform notifications
  // only on the real transition — not on every redundant Stripe retry / update
  // event. "Was it active before this event?" is the dedupe key. (Notification
  // failures never affect the webhook — notifyAddOnChange is best-effort.)
  const prior = await prisma.restaurantAddOn.findUnique({
    where: { restaurantId_addOnId: { restaurantId, addOnId: addOn.id } },
    select: { status: true, graceEndsAt: true },
  });
  const wasActive = !!prior && (prior.status === "active" || prior.status === "trialing");

  if (event.type === "customer.subscription.deleted") {
    await prisma.restaurantAddOn.updateMany({
      where: { restaurantId, addOnId: addOn.id },
      data: {
        status: "cancelled",
        cancelAtPeriodEnd: false,
      },
    });
    // Only notify if it was actually active before — a repeat "deleted" or a
    // delete of an already-cancelled row shouldn't re-alert anyone.
    if (wasActive) {
      try {
        await notifyAddOnChange(restaurantId, { slug: addOn.slug, name: addOn.name }, "cancelled");
      } catch (e) {
        console.error("[stripe] add-on cancel notification failed", e);
      }
    }
    // Cancelling a FAILING add-on (owner gives up on it, or Stripe auto-cancels
    // after exhausted retries) ends its dunning: release the shared restaurant
    // grace clock if nothing else is still failing.
    if (prior?.status === "past_due") {
      try {
        await clearRestaurantGraceIfHealthy(restaurantId);
      } catch (e) {
        console.error("[stripe] add-on delete: clearRestaurantGraceIfHealthy failed", e);
      }
    }
    return;
  }

  const sAny = sub as any;
  const periodEndSec: number | undefined =
    sAny.current_period_end ?? sAny.items?.data?.[0]?.current_period_end;
  const trialEndSec = sAny.trial_end as number | undefined;
  const status = mapStripeStatus(sub.status);

  // Dunning grace (Luigi 2026-06-15): when this add-on goes past_due, keep its
  // features alive for the grace window instead of dropping them immediately —
  // stamp a deadline, preserving any existing one so Stripe retries don't push
  // it out. The entitlement check (grantingAddOnWhere) reads this column. Any
  // granting / other status clears it (recovery restores the feature).
  const addOnGraceEndsAt =
    status === "past_due" ? (prior?.graceEndsAt ?? graceDeadline()) : null;

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
      graceEndsAt: addOnGraceEndsAt,
      activatedAt: new Date(),
    },
    update: {
      status,
      stripeSubscriptionId: sub.id,
      currentPeriodEnd: periodEndSec ? new Date(periodEndSec * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      trialEndsAt: trialEndSec ? new Date(trialEndSec * 1000) : null,
      graceEndsAt: addOnGraceEndsAt,
    },
  });

  // A failed add-on charge also starts the restaurant-level dunning clock, so
  // the daily cron nudges the owner + their reseller and the admin shows the
  // banner. Idempotent — won't reset a clock that's already running.
  if (status === "past_due") {
    try {
      await startRestaurantGrace(restaurantId);
    } catch (e) {
      console.error("[stripe] add-on past_due: startRestaurantGrace failed", e);
    }
  }

  // Recovery transition (past_due → anything else): this row's own grace was
  // just cleared by the upsert above — release the restaurant-level clock too
  // when nothing else is failing. Needed here because invoice.paid may process
  // BEFORE this event, while the row still read past_due; without this hook
  // that ordering leaves a recovered restaurant stuck in the countdown until
  // it falsely "expires".
  if (prior?.status === "past_due" && status !== "past_due") {
    try {
      await clearRestaurantGraceIfHealthy(restaurantId);
    } catch (e) {
      console.error("[stripe] add-on recovery: clearRestaurantGraceIfHealthy failed", e);
    }
  }

  // ── Side effects on activation ───────────────────────────────────────
  // When specific add-ons go active/trialing, create the related rows so
  // the customer-facing UI lights up immediately instead of waiting for
  // a first admin-page visit. Idempotent helpers — safe on Stripe retries.
  const isActive = status === "active" || status === "trialing";

  // Platform notification on the not-active → active transition (a NEW paid
  // add-on subscription). Gated on wasActive so a renewal / metadata-only
  // update event doesn't re-notify. Best-effort; never blocks the webhook.
  if (!wasActive && isActive) {
    try {
      await notifyAddOnChange(restaurantId, { slug: addOn.slug, name: addOn.name }, "activated");
    } catch (e) {
      console.error("[stripe] add-on activate notification failed", e);
    }
  }

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
      // Monthly subscription ended. TWO paths:
      //
      //   1. switchToPaygOnCancel=true — the restaurant explicitly
      //      clicked "Switch to PAYG" via /admin/marketplace/payg-opt-in
      //      (which sets the flag + Stripe cancel_at_period_end). At
      //      cycle end Stripe fires this event; we PRESERVE the listing
      //      (isListed stays true), flip billingMode to "payg", and
      //      reset the flag. PAYG settlement takes over with no gap.
      //
      //   2. switchToPaygOnCancel=false (default) — cancellation due
      //      to a real exit (card declined, manual unsubscribe without
      //      a switch intent, etc.). HIDE the listing (isListed=false)
      //      so it disappears from /marketplace immediately, and reset
      //      billingMode to "payg" as a safe default. The restaurant
      //      has to re-visit /admin/marketplace to re-list — prevents
      //      the silent "I cancelled but I'm still being billed per
      //      order" surprise.
      try {
        const listing = await prisma.marketplaceListing.findUnique({
          where: { restaurantId },
          select: { switchToPaygOnCancel: true },
        });
        if (listing?.switchToPaygOnCancel) {
          await prisma.marketplaceListing.update({
            where: { restaurantId },
            data: {
              billingMode: "payg",
              switchToPaygOnCancel: false, // reset — the switch has happened
              // isListed left as-is (stays true)
            },
          });
        } else {
          await prisma.marketplaceListing.updateMany({
            where: { restaurantId },
            data: { billingMode: "payg", isListed: false },
          });
        }
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

  // On activation, auto-provision a generic subdomain so a branded
  // login/signup URL exists out of the box. Idempotent (no-ops when one is
  // already set) + best-effort (never throws), so Stripe retries are safe and
  // a vanity-URL hiccup can't fail the webhook. ensureResellerGenericSubdomain
  // re-checks whiteLabelStatus === "active" internally.
  if (status === "active") {
    await ensureResellerGenericSubdomain(resellerProfileId);
  }
}

/** Map Stripe's subscription.status enum onto our local string set.
 *  Note: Stripe "trialing" is mapped to "active" — we no longer have a
 *  trial concept; any subscription Stripe says is trialing is treated
 *  as paying. Legacy rows whose subscriptionStatus column is still
 *  literally "trialing" are handled by the GRANTING_STATUSES list in
 *  src/lib/entitlements.ts and read as equivalent to "active". */
function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  switch (stripeStatus) {
    case "trialing": return "active";
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
