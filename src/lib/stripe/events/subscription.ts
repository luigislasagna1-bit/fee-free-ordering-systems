import type Stripe from "stripe";
import prisma from "@/lib/db";
import { getStripe } from "@/lib/stripe";
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
    select: { id: true, email: true, name: true, defaultLanguage: true, stripeSubscriptionId: true },
  });
  if (!restaurant) {
    // Customer may have been deleted on our side; nothing to update.
    console.warn(`[stripe] subscription event for unknown customer ${customerId}`);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    // Deletion of a SUPERSEDED duplicate (see supersedeDuplicateSubscription)
    // must not cancel the row that now tracks the surviving subscription.
    if (restaurant.stripeSubscriptionId && restaurant.stripeSubscriptionId !== sub.id) {
      console.warn(
        `[stripe] ignoring deletion of superseded platform subscription ${sub.id} for restaurant ${restaurant.id} (row tracks ${restaurant.stripeSubscriptionId})`
      );
      // The dead duplicate may be the last thing holding the shared dunning
      // clock (its failed invoice started it) — release it if everything the
      // row tracks is healthy. Health-checked no-op otherwise.
      try {
        await clearRestaurantGraceIfHealthy(restaurant.id);
      } catch (e) {
        console.error("[stripe/subscription] superseded-delete: clearRestaurantGraceIfHealthy failed", e);
      }
      return;
    }
    // Sub-id check ALSO lives in the WHERE: the read above races a concurrent
    // supersede that re-stamps the row (the dispatcher runs retried deliveries
    // concurrently), so the write must be conditional to be safe. The null arm
    // keeps legacy rows with no tracked id cancellable.
    await prisma.restaurant.updateMany({
      where: {
        id: restaurant.id,
        OR: [{ stripeSubscriptionId: sub.id }, { stripeSubscriptionId: null }],
      },
      data: {
        subscriptionStatus: "cancelled",
        stripeSubscriptionId: null,
        cancelAtPeriodEnd: false,
      },
    });
    // A plan cancelled while failing must also end its dunning (same hook the
    // add-on deleted branch has): otherwise the cron keeps counting down and
    // ends by telling an owner who already cancelled that we paused their
    // features for non-payment. Health-checked — refuses to clear while any
    // add-on is still inside its own grace window.
    try {
      await clearRestaurantGraceIfHealthy(restaurant.id);
    } catch (e) {
      console.error("[stripe/subscription] platform delete: clearRestaurantGraceIfHealthy failed", e);
    }
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

  // Duplicate guard: if the row already tracks a DIFFERENT live subscription
  // (double Checkout race), keep exactly one and cancel the other in Stripe.
  if (!(await supersedeDuplicateSubscription(sub, restaurant.stripeSubscriptionId, `platform plan (restaurant ${restaurant.id})`))) {
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
    select: { status: true, graceEndsAt: true, stripeSubscriptionId: true },
  });
  const wasActive = !!prior && (prior.status === "active" || prior.status === "trialing");

  if (event.type === "customer.subscription.deleted") {
    // Deletion of a SUPERSEDED duplicate (see supersedeDuplicateSubscription)
    // must not cancel the row that now tracks the surviving subscription —
    // otherwise cancelling the duplicate would kill the paid entitlement.
    if (prior?.stripeSubscriptionId && prior.stripeSubscriptionId !== sub.id) {
      console.warn(
        `[stripe] ignoring deletion of superseded add-on subscription ${sub.id} for ${addOnSlug} (restaurant ${restaurantId}, row tracks ${prior.stripeSubscriptionId})`
      );
      // The dead duplicate's failed invoice may have started the shared
      // restaurant dunning clock — nothing else resolves that sub, so release
      // the clock here if everything still tracked is healthy.
      try {
        await clearRestaurantGraceIfHealthy(restaurantId);
      } catch (e) {
        console.error("[stripe] add-on superseded-delete: clearRestaurantGraceIfHealthy failed", e);
      }
      return;
    }
    // Conditional write (sub-id check in the WHERE, mirroring the read-guard
    // above): a concurrent supersede can re-stamp the row between our read and
    // this write — the winner's row state must not be clobbered by the loser's
    // deleted event. graceEndsAt is cleared too: a cancelled row's dunning
    // story is over (matches getAddOnBillingState, which treats cancelled rows
    // as inactive) — leaving it stamped lets a later crash-race re-stamp
    // contradict the restaurant-level clock.
    const cancelled = await prisma.restaurantAddOn.updateMany({
      where: {
        restaurantId,
        addOnId: addOn.id,
        OR: [{ stripeSubscriptionId: sub.id }, { stripeSubscriptionId: null }],
      },
      data: {
        status: "cancelled",
        cancelAtPeriodEnd: false,
        graceEndsAt: null,
      },
    });
    // Only notify if it was actually active before AND our write landed — a
    // repeat "deleted", a delete of an already-cancelled row, or a write
    // skipped by the conditional guard shouldn't alert anyone.
    if (wasActive && cancelled.count === 1) {
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

  // Duplicate guard: if the row already tracks a DIFFERENT live subscription
  // (double Checkout race), keep exactly one and cancel the other in Stripe.
  // Complimentary rows (stripeSubscriptionId null) pass straight through.
  if (!(await supersedeDuplicateSubscription(sub, prior?.stripeSubscriptionId, `add-on ${addOnSlug} (restaurant ${restaurantId})`))) {
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
    select: { id: true, whiteLabelStripeSubscriptionId: true },
  });
  if (!profile) {
    console.warn(`[stripe] white-label event for unknown reseller ${resellerProfileId}`);
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    // Deletion of a SUPERSEDED duplicate (see supersedeDuplicateSubscription)
    // must not cancel the row that now tracks the surviving subscription.
    if (profile.whiteLabelStripeSubscriptionId && profile.whiteLabelStripeSubscriptionId !== sub.id) {
      console.warn(
        `[stripe] ignoring deletion of superseded white-label subscription ${sub.id} for reseller ${resellerProfileId} (row tracks ${profile.whiteLabelStripeSubscriptionId})`
      );
      return;
    }
    // Conditional write — same read-vs-write race as the platform/add-on
    // deleted guards: the loser's deleted event must not clobber a row a
    // concurrent supersede just re-stamped to the winner.
    await prisma.resellerProfile.updateMany({
      where: {
        id: resellerProfileId,
        OR: [{ whiteLabelStripeSubscriptionId: sub.id }, { whiteLabelStripeSubscriptionId: null }],
      },
      data: {
        whiteLabelTier: null,
        whiteLabelStatus: "cancelled",
        whiteLabelStripeSubscriptionId: null,
        whiteLabelCancelAtPeriodEnd: false,
      },
    });
    return;
  }

  // Duplicate guard: if the profile already tracks a DIFFERENT live
  // subscription (double Checkout race), keep exactly one and cancel the
  // other in Stripe. (Tier swaps reuse the same sub id — never guarded.)
  if (!(await supersedeDuplicateSubscription(sub, profile.whiteLabelStripeSubscriptionId, `white-label (reseller ${resellerProfileId})`))) {
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

// ─── Duplicate-subscription supersede guard ─────────────────────────────────
//
// Two Checkout sessions opened before the first completes can BOTH be
// completed (they're independent Stripe sessions), yielding TWO live
// subscriptions for the same add-on / plan / white-label tier while our row
// only stores ONE sub id — the loser keeps billing with no in-app cancel
// path. checkoutSessionExpiresAt() shrinks the race window to ~35 min; this
// guard is the backstop for duplicates that still land: when an event tries
// to stamp a row that already tracks a DIFFERENT live subscription, keep
// exactly one and cancel the other in Stripe.
//
// The winner rule must be STABLE across Stripe's out-of-order delivery and
// retries — both subs' events must independently agree on the same survivor,
// or each would cancel the other:
//   1. a live sub beats an incomplete one (never kill a paying sub for a
//      husk whose first payment never landed),
//   2. then the NEWER `created` wins (the latest completed checkout is the
//      customer's most recent intent — also means a fresh checkout replaces
//      a months-old sub instead of being killed by it),
//   3. then the greater id, as a pure tie-break.
// Every step is best-effort: a supersede hiccup must never throw (the whole
// webhook event would 500 → Stripe retries) or block the row update.

/** Checkout's max session lifetime (24h) + slack. Two subs born within this
 *  window are a true double-checkout → full refund of the duplicate charge.
 *  Anything older being replaced gets prorated credit instead — a blanket
 *  refund would hand back weeks of already-consumed service. */
const DUPLICATE_CHECKOUT_WINDOW_SEC = 26 * 60 * 60;

/** 0 = dead, 1 = incomplete (first payment never landed), 2 = failing
 *  (past_due / unpaid), 3 = paying (active / trialing / paused). A paying sub
 *  must OUTRANK a failing one — with equal rank the created-recency tie-break
 *  would let a newer duplicate whose card just died cancel an older paying
 *  sub and drag the owner into dunning. paused ranks with paying: its billing
 *  isn't failing, and killing a paused sub for a failing newer one is wrong. */
function subscriptionLiveness(s: Stripe.Subscription): number {
  if (s.status === "canceled" || s.status === "incomplete_expired") return 0;
  if (s.status === "incomplete") return 1;
  if (s.status === "past_due" || s.status === "unpaid") return 2;
  return 3;
}

/**
 * Decide whether `incoming` may be stamped onto a row currently tracking
 * `existingSubId`, cancelling (+ refunding) whichever subscription loses.
 * Returns false when the row must be left pointing at the existing
 * subscription (late / out-of-order event from the sub that lost).
 */
async function supersedeDuplicateSubscription(
  incoming: Stripe.Subscription,
  existingSubId: string | null | undefined,
  label: string,
): Promise<boolean> {
  if (!existingSubId || existingSubId === incoming.id) return true;

  let existing: Stripe.Subscription;
  try {
    const stripe = await getStripe();
    existing = await stripe.subscriptions.retrieve(existingSubId);
  } catch (e: any) {
    const missing =
      e?.code === "resource_missing" || e?.raw?.code === "resource_missing" || e?.statusCode === 404;
    if (!missing) {
      console.error(
        `[stripe] supersede check for ${label}: could not inspect ${existingSubId}; stamping ${incoming.id} (pre-guard behavior)`,
        e
      );
    }
    // Tracked sub is gone entirely (deleted long ago, or a legacy id from the
    // platform test→live switch) — nothing to supersede, stamp normally.
    return true;
  }

  if (subscriptionLiveness(existing) === 0) return true; // legit re-subscribe after cancel

  // Judge the INCOMING side from retrieved truth too — the webhook payload is
  // a snapshot from emission time and Stripe delivers out of order, so an
  // "active" snapshot can describe a sub this very guard already cancelled.
  // Deciding from the snapshot would cancel the SURVIVING paid sub (and
  // refund it). Only this rare duplicate path pays the extra retrieve.
  let incomingFresh: Stripe.Subscription;
  try {
    const stripe = await getStripe();
    incomingFresh = await stripe.subscriptions.retrieve(incoming.id);
  } catch (e: any) {
    const missing =
      e?.code === "resource_missing" || e?.raw?.code === "resource_missing" || e?.statusCode === 404;
    if (!missing) {
      console.error(
        `[stripe] supersede check for ${label}: could not inspect incoming ${incoming.id}; keeping row on ${existing.id}`,
        e
      );
    }
    // Unfetchable/gone incoming = treat as dead: never risk cancelling the
    // tracked live sub on unverifiable state. A later event on either sub
    // re-runs this path with fresh reads.
    return false;
  }

  if (subscriptionLiveness(incomingFresh) === 0) {
    // Late event from a sub that's already dead must not clobber the live row.
    console.warn(
      `[stripe] supersede for ${label}: ignoring event for dead subscription ${incomingFresh.id}; row keeps ${existing.id}`
    );
    return false;
  }

  const incomingWins =
    subscriptionLiveness(incomingFresh) !== subscriptionLiveness(existing)
      ? subscriptionLiveness(incomingFresh) > subscriptionLiveness(existing)
      : incomingFresh.created !== existing.created
        ? incomingFresh.created > existing.created
        : incomingFresh.id > existing.id;
  const winner = incomingWins ? incomingFresh : existing;
  const loser = incomingWins ? existing : incomingFresh;
  console.warn(
    `[stripe] duplicate subscription for ${label}: keeping ${winner.id} (created ${winner.created}), superseding ${loser.id} (created ${loser.created})`
  );
  await cancelSupersededSubscription(loser, winner, label);
  return incomingWins;
}

/** Cancel the losing subscription in Stripe and make the money right. */
async function cancelSupersededSubscription(
  loser: Stripe.Subscription,
  winner: Stripe.Subscription,
  label: string,
) {
  const isCheckoutDuplicate =
    Math.abs(winner.created - loser.created) <= DUPLICATE_CHECKOUT_WINDOW_SEC;
  try {
    const stripe = await getStripe();
    await stripe.subscriptions.cancel(
      loser.id,
      // True duplicate → plain cancel; the full refund below squares it.
      // Older sub replaced → prorated credit for its unused time instead.
      isCheckoutDuplicate ? {} : { prorate: true, invoice_now: true },
    );
    console.warn(`[stripe] cancelled superseded subscription ${loser.id} for ${label}`);
  } catch (e) {
    // "Already canceled" (webhook retry) lands here too — the refund below is
    // idempotent, so still attempt it. A real failure leaves the loser
    // billing: log loudly for a manual dashboard cancel; the next event on
    // either sub re-runs this whole path.
    console.error(
      `[stripe] FAILED to cancel superseded subscription ${loser.id} for ${label} — cancel manually in the Stripe dashboard`,
      e
    );
  }
  if (isCheckoutDuplicate) {
    await refundLatestPaidInvoice(loser, label);
  }
}

/** Best-effort full refund of a duplicate subscription's charge. Never throws. */
async function refundLatestPaidInvoice(loser: Stripe.Subscription, label: string) {
  try {
    const stripe = await getStripe();
    const invoiceId =
      typeof loser.latest_invoice === "string" ? loser.latest_invoice : loser.latest_invoice?.id ?? null;
    if (!invoiceId) {
      console.warn(`[stripe] superseded ${loser.id} (${label}) has no invoice — nothing to refund`);
      return;
    }
    // The invoice→payment link moved across Stripe API versions: legacy
    // top-level payment_intent / charge vs the newer `payments` list. Ask
    // for the expansion but tolerate versions that reject it, read all shapes.
    let invoice: any;
    try {
      invoice = await stripe.invoices.retrieve(invoiceId, { expand: ["payments"] });
    } catch {
      invoice = await stripe.invoices.retrieve(invoiceId);
    }
    if (invoice?.status !== "paid" || !(invoice.amount_paid > 0)) {
      console.warn(
        `[stripe] superseded ${loser.id} (${label}): invoice ${invoiceId} is ${invoice?.status} / ${invoice?.amount_paid} — not refunding`
      );
      return;
    }
    const paidPayment = invoice.payments?.data?.find((p: any) => p?.status === "paid")?.payment;
    const piRef = invoice.payment_intent ?? paidPayment?.payment_intent ?? null;
    const paymentIntent = typeof piRef === "string" ? piRef : piRef?.id ?? null;
    const chargeRef = invoice.charge ?? paidPayment?.charge ?? null;
    const charge = typeof chargeRef === "string" ? chargeRef : chargeRef?.id ?? null;
    if (!paymentIntent && !charge) {
      console.error(
        `[stripe] superseded ${loser.id} (${label}): cannot resolve invoice ${invoiceId}'s payment — REFUND MANUALLY in the Stripe dashboard`
      );
      return;
    }
    await stripe.refunds.create(
      {
        ...(paymentIntent ? { payment_intent: paymentIntent } : { charge: charge as string }),
        reason: "duplicate",
      },
      // Keyed on the invoice so webhook retries / re-entry never refund twice.
      { idempotencyKey: `supersede-refund-${invoiceId}` },
    );
    console.warn(`[stripe] refunded duplicate charge on invoice ${invoiceId} (sub ${loser.id}, ${label})`);
  } catch (e: any) {
    if (e?.code === "charge_already_refunded" || e?.raw?.code === "charge_already_refunded") return;
    console.error(
      `[stripe] refund of superseded subscription ${loser.id} (${label}) FAILED — refund manually in the Stripe dashboard`,
      e
    );
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
