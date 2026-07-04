import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { getSessionUser } from "@/lib/session";
import { notifyStaff, notifyCustomer, staffAcceptEventForOrderType } from "@/lib/notifications";
import {
  capturePayment,
  refundDirectPayment,
  voidPayment,
} from "@/lib/stripe";
import {
  capturePaypalAuthorization,
  voidPaypalAuthorization,
  refundPaypalCapture,
} from "@/lib/paypal";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";
import { unrecordSmartLinkOrder } from "@/lib/marketing-studio";
import { dispatchOrderToShipday, cancelShipdayOrder, shouldDispatchToShipday } from "@/lib/shipday";
import { verifyOrderToken } from "@/lib/order-status-token";
import { redeemCouponsForOrder, releaseCouponsForOrder } from "@/lib/coupon-ledger";
import { redeemForOrder as redeemRewardForOrder, releaseForOrder as releaseRewardForOrder, refundForOrder as refundRewardForOrder, awardForOrder as awardRewardForOrder, getOrderRewardSummary } from "@/lib/reward-ledger";
import { awardEarnRulesForOrder, awardPromoCreditsForOrder } from "@/lib/reward-earn";
import { releasePromotionUsageForOrder } from "@/lib/promo-usage";
import { RESELLER_WHITE_LABEL_SELECT } from "@/lib/white-label";

const ALLOWED_STATUSES = ["pending", "accepted", "preparing", "ready", "completed", "rejected", "cancelled"] as const;

const PUBLIC_ORDER_SELECT = {
  id: true, orderNumber: true, status: true, type: true,
  customerName: true, notes: true, subtotal: true, taxAmount: true,
  deliveryFee: true, tip: true, total: true, paymentMethod: true,
  // Reward Dollars spent on this order (part-payment). Shown on the
  // receipt/status breakdown as "Paid with {rewardName}". Luigi 2026-06-29.
  creditApplied: true,
  // scheduledSlotMinutes: range-mode window width ("6:00 – 6:15" promise;
  // Fabrizio cmqqxerxs) — status/confirmation pages append the window end.
  paymentStatus: true, scheduledFor: true, scheduledSlotMinutes: true, estimatedReady: true,
  acceptedAt: true, rejectedAt: true, rejectionReason: true,
  completedAt: true, preparationTime: true, createdAt: true,
  refundStatus: true,
  // Delivery context — the status page renders the "Delivery to" block
  // when type === "delivery" so the customer can verify the address is
  // correct (and easily call the restaurant about it). Customer-typed
  // delivery instructions are concatenated into `notes` at order-create
  // time (see CheckoutModal → buildOrderPayload) and surfaced from there.
  deliveryAddress: true, deliveryCity: true, deliveryZip: true,
  // Promo snapshot — same JSON-stringified array the confirmation page
  // already renders. Lets the status page show "Promos applied" + the
  // struck-through delivery fee even days later when the customer
  // revisits the order from /account.
  appliedPromos: true,
  couponDiscount: true, promoDiscount: true,
  // Marketplace attribution — used by the status page so the "← Back"
  // link sends customers back to the marketplace grid (where they came
  // from) instead of the standalone restaurant menu.
  viaMarketplace: true,
  // Bundle children — receipts + status page need this to render the
  // parent-bundle line with its child picks (Promo Type 8 / 13).
  // Selected as Json since it's stored as Json on OrderItem.
  restaurant: {
    // kitchenWorkflowMode lets the customer status page render the
    // RIGHT step count: "simple" mode just shows Received → Confirmed →
    // Complete (the kitchen never transitions through Preparing / Ready),
    // while "tracking" mode shows the full 5-step flow.
    //
    // phone + email + address: surface on the status page's "Need help?"
    // panel so customers can call/email the restaurant directly about
    // their order without leaving the page.
    select: {
      name: true, slug: true, phone: true, email: true,
      address: true, city: true, state: true, zip: true,
      estimatedPickup: true, estimatedDelivery: true,
      kitchenWorkflowMode: true,
      // Reward Dollars: feature flag + customer-facing name so the receipt
      // can label "Paid with {name}" / "You earned {name}". Luigi 2026-06-29.
      rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true,
      // Timezone so the status page renders a scheduled order's date/time in
      // the restaurant's local clock, not the viewer's browser zone.
      timezone: true,
      // 12h/24h preference so the status page renders scheduled times +
      // step timestamps in the restaurant's chosen format.
      hoursFormat: true,
      // Surface the restaurant's chosen currency so the customer
      // status page formats $/€/£ to match what they paid in. Without
      // this, a European customer who paid €20 would see "$20.00" on
      // the receipt — confusing and wrong.
      currency: true,
      // Reseller white-label fields — let the status page gate the
      // "Powered by Fee Free Ordering" credit (shown for every restaurant
      // EXCEPT reseller white-label accounts). Luigi 2026-06-22.
      resellerProfile: { select: RESELLER_WHITE_LABEL_SELECT },
    },
  },
  items: {
    select: {
      id: true, menuItemId: true, variantId: true,
      name: true, price: true, quantity: true, subtotal: true,
      notes: true, variantName: true, bundleItems: true,
      modifiers: { select: { name: true, priceAdjustment: true } },
    },
  },
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (user?.restaurantId) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        restaurant: { select: { name: true, slug: true, phone: true, estimatedPickup: true, estimatedDelivery: true, kitchenWorkflowMode: true } },
        items: { include: { modifiers: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.restaurantId !== user.restaurantId && user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(order);
  }

  const order = await prisma.order.findUnique({ where: { id }, select: PUBLIC_ORDER_SELECT });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  // Reward Dollars earned on this order (computed from the ledger, only when the
  // feature is on — keeps this off the query path for stores that don't use it).
  let rewardEarned = 0;
  if (order.restaurant?.rewardsEnabled) {
    rewardEarned = (await getOrderRewardSummary(id)).earned;
  }
  return NextResponse.json({ ...order, rewardEarned });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // preferKitchen: true — this endpoint is called from BOTH the kitchen
  // display (accept/reject/status-update) AND the admin orders page.
  // Without preferKitchen, kitchen-only users (no admin cookie) got 401s
  // when clicking Accept because the session resolver returned the admin
  // session (null) first and never reached the kitchen fallback. Setting
  // preferKitchen=true tips the resolution toward the kitchen session;
  // admin users still work because their session is the fallback.
  const user = await getSessionUser({ preferKitchen: true });
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      restaurantId: true,
      status: true,
      paymentStatus: true,
      paymentIntentId: true,
      paypalOrderId: true,
      paypalAuthorizationId: true,
      paypalCaptureId: true,
      paymentMethod: true,
      viaMarketplace: true,
      marketplaceCounterApplied: true,
      smartLinkCounterApplied: true,
      total: true,
      // Reward Dollars part-payment — the card refund is capped at what was
      // actually captured (total − creditApplied); the credit itself is
      // restored to the wallet via refundRewardForOrder. Blocker #8.
      creditApplied: true,
      // Scheduled slot — on accept we set estimatedReady to this (not now+prep)
      // so a future pickup/delivery shows its real ready time, not "20 min".
      scheduledFor: true,
      // ShipDay tracking — used by the dispatch path on accept and the
      // cancel path on reject/cancel.
      type: true,
      shipdayOrderId: true,
      // estimatedPickup/Delivery used as the fallback prep time when the
      // kitchen Accepts without specifying preparationTime — without
      // this fallback we'd leave the order's soft estimate (set at
      // creation as createdAt + prep) untouched, making the customer's
      // countdown stale by however many minutes the order sat in pending.
      restaurant: { select: { stripeAccountId: true, estimatedPickup: true, estimatedDelivery: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (existing.restaurantId !== user.restaurantId && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const newStatus = data.status as string;

  if (!ALLOWED_STATUSES.includes(newStatus as typeof ALLOWED_STATUSES[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // ── Capture-on-accept ────────────────────────────────────────────────────
  // Under the authorize-then-capture model, the customer's card has only
  // been AUTHORIZED at this point — no money has moved yet. When the
  // kitchen clicks "Accept" we must actually capture the funds before
  // committing the state transition. If capture fails (card declined at
  // capture, authorization expired) we BLOCK the acceptance so the
  // restaurant doesn't start cooking food they'll never get paid for.
  if (
    newStatus === "accepted" &&
    existing.paymentMethod === "card" &&
    existing.paymentStatus === "authorized" &&
    existing.paymentIntentId
  ) {
    try {
      await capturePayment({
        paymentIntentId: existing.paymentIntentId,
        restaurantId: existing.restaurantId,
      });
      // Key-only model: the restaurant's own account does NOT webhook the
      // platform, so we flip paymentStatus="paid" ourselves below (inline
      // in `updates`) — there is no webhook backstop. The capture call
      // above is the source of truth for "money moved".
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Partial-failure retry trap (audit 2026-05-30): a previous accept
      // attempt may have succeeded at capture but failed at the DB
      // update that follows (transient Neon hiccup, lambda timeout,
      // etc.). The staff click again. capturePayment is called again
      // and Stripe responds with the "already captured" error. Without
      // this catch we'd block the retry forever — customer's card was
      // already charged but the kitchen can't progress the order.
      //
      // Stripe surfaces this as code `payment_intent_unexpected_state`
      // with a message that includes "already been captured" or
      // "already_captured" or status "succeeded" / "canceled". We
      // accept any of these as "OK, money already moved, proceed".
      const stripeCode = (e as any)?.code ?? "";
      const stripeStatus = (e as any)?.raw?.payment_intent?.status ?? "";
      const isAlreadyCaptured =
        stripeCode === "payment_intent_unexpected_state" &&
        (msg.toLowerCase().includes("already") ||
         stripeStatus === "succeeded" ||
         stripeStatus === "canceled");
      if (isAlreadyCaptured) {
        console.warn(
          `[orders PATCH] capturePayment for ${id} reports already-captured — treating as success and proceeding with accept.`,
        );
        // Fall through to the order.update below. The webhook will
        // (or already has) set paymentStatus="paid".
      } else {
        console.error(`[orders PATCH] capturePayment failed for order ${id}:`, msg);
        return NextResponse.json(
          {
            error:
              "Couldn't charge the customer's card. The card may have been declined or the authorization expired. Reject this order to release the hold.",
            code: "capture_failed",
            detail: msg,
          },
          { status: 402 },
        );
      }
    }
  }

  // Same dance for PayPal — capture the authorization on accept. If
  // PayPal declines (auth expired, funding source revoked) we block
  // acceptance so the kitchen isn't cooking food we can't collect on.
  let paypalCaptureIdJustSet: string | null = null;
  if (
    newStatus === "accepted" &&
    existing.paymentMethod === "paypal" &&
    existing.paymentStatus === "authorized" &&
    existing.paypalAuthorizationId
  ) {
    try {
      const cap = await capturePaypalAuthorization({
        restaurantId: existing.restaurantId,
        authorizationId: existing.paypalAuthorizationId,
        orderId: id,
      });
      paypalCaptureIdJustSet = cap.captureId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Same partial-failure retry trap as Stripe above. PayPal
      // surfaces "already captured" as the issue name
      // `AUTHORIZATION_ALREADY_CAPTURED`; the auth-already-completed
      // case is `AUTH_CAPTURE_NOT_ALLOWED` / `AUTH_VOIDED` with a
      // status string of "CAPTURED" / "COMPLETED". Treat any of these
      // as success — money already moved.
      const lower = msg.toLowerCase();
      const isAlreadyCaptured =
        lower.includes("already_captured") ||
        lower.includes("already been captured") ||
        lower.includes("authorization_already_captured") ||
        lower.includes("auth_capture_not_allowed");
      if (isAlreadyCaptured) {
        console.warn(
          `[orders PATCH] PayPal capture for ${id} reports already-captured — treating as success.`,
        );
        // Fall through; downstream order update proceeds. The PayPal
        // webhook (PAYMENT.CAPTURE.COMPLETED) will set paymentStatus="paid"
        // independently.
      } else {
        console.error(`[orders PATCH] capturePaypalAuthorization failed for order ${id}:`, msg);
        return NextResponse.json(
          {
            error:
              "Couldn't capture the PayPal payment. The customer's authorization may have expired. Reject this order to release the hold.",
            code: "paypal_capture_failed",
            detail: msg,
          },
          { status: 402 },
        );
      }
    }
  }

  const updates: Record<string, unknown> = { status: newStatus };

  if (newStatus === "accepted") {
    updates.acceptedAt = new Date();
    // Flip paymentStatus → "paid" inline if we just captured (above) or
    // if this is a non-card order. The webhook will land independently
    // and re-set the same value (idempotent).
    if (existing.paymentMethod === "card" && existing.paymentStatus === "authorized") {
      updates.paymentStatus = "paid";
    }
    if (existing.paymentMethod === "paypal" && existing.paymentStatus === "authorized") {
      updates.paymentStatus = "paid";
      if (paypalCaptureIdJustSet) updates.paypalCaptureId = paypalCaptureIdJustSet;
    }
    // Prep-time on acceptance: prefer the explicit value the kitchen
    // staff entered, fall back to the restaurant's default for this
    // order type. We ALWAYS recompute estimatedReady here — not just
    // when prepTime is provided — because the order may have been
    // sitting in pending with a stale soft estimate (createdAt +
    // default) from order creation. Once the kitchen Accepts, the
    // prep clock starts NOW, so estimatedReady = now + prepTime.
    const explicitPrepTime = parseInt(data.preparationTime, 10);
    const fallbackPrepTime = existing.type === "delivery"
      ? existing.restaurant.estimatedDelivery
      : existing.restaurant.estimatedPickup;
    const finalPrepTime =
      !isNaN(explicitPrepTime) && explicitPrepTime > 0 && explicitPrepTime <= 240
        ? explicitPrepTime
        : fallbackPrepTime;
    // SCHEDULED orders: the ready time is the customer's chosen slot (e.g. a
    // Thursday pickup), NOT now + prepTime. Accepting must never turn a
    // 5-days-out order into "ready in 20 min" — that wrong estimatedReady was
    // leaking into the kitchen countdown, the customer email, the status page
    // and the Complete tab. ASAP orders keep the prep-clock-starts-now
    // behaviour. Luigi 2026-06-05.
    const scheduledMs = existing.scheduledFor ? new Date(existing.scheduledFor).getTime() : NaN;
    if (Number.isFinite(scheduledMs) && scheduledMs > Date.now()) {
      updates.estimatedReady = new Date(scheduledMs);
      // Keep an explicit prep time if the kitchen entered one (informational);
      // otherwise leave preparationTime untouched — it's irrelevant to a slot.
      if (!isNaN(explicitPrepTime) && explicitPrepTime > 0 && explicitPrepTime <= 240) {
        updates.preparationTime = explicitPrepTime;
      }
    } else if (finalPrepTime && finalPrepTime > 0) {
      updates.preparationTime = finalPrepTime;
      updates.estimatedReady = new Date(Date.now() + finalPrepTime * 60 * 1000);
    }
  }
  if (newStatus === "rejected") {
    updates.rejectedAt = new Date();
    updates.rejectionReason = String(data.rejectionReason ?? "").slice(0, 500) || null;
  }
  if (newStatus === "completed") {
    updates.completedAt = new Date();
  }
  // Manual progression to Ready/Complete from the kitchen → mark it as
  // manually cleared so Simple mode moves it out of In Progress and into
  // Complete immediately (GloriaFood-style). This route is only ever hit by
  // staff actions; the auto-complete sweeps use updateMany and bypass it, so
  // they never set this flag. Tracking mode ignores it. Luigi 2026-06-07.
  if (newStatus === "ready" || newStatus === "completed") {
    updates.manuallyClearedAt = new Date();
  }
  if (newStatus === "cancelled") {
    updates.rejectedAt = new Date();
    updates.rejectionReason = String(data.rejectionReason ?? "Cancelled by restaurant").slice(0, 500);
  }

  const order = await prisma.order.update({
    where: { id },
    data: updates,
    // rewardsEnabled + labels: the accepted staff email shows "To collect"
    // (total − store credit) ONLY when the rewards program is on. Luigi 2026-07-02.
    include: { restaurant: { select: { id: true, name: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true, defaultLanguage: true, rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true } } },
  });

  // ── Reserve-then-order: keep the linked table booking in lockstep ─────────
  // A pre-order order carries a linked Reservation (Reservation.orderId). The
  // kitchen accepts the ORDER once — that single action confirms the table too;
  // rejecting / cancelling the order releases the booking. updateMany is a no-op
  // for every normal order (no linked reservation). Luigi 2026-06-08.
  if (newStatus === "accepted" || newStatus === "rejected" || newStatus === "cancelled") {
    const resStatus = newStatus === "accepted" ? "confirmed" : newStatus; // rejected | cancelled
    try {
      await prisma.reservation.updateMany({
        where: { orderId: id },
        data: { status: resStatus },
      });
    } catch (e) {
      console.error("[orders PATCH] reservation sync:", e);
    }
  }

  // ── Coupon ledger lifecycle ──────────────────────────────────────────────
  // A COMPLETED order's coupons are terminally redeemed; a REJECTED/CANCELLED
  // order's coupons are released back to the customer (available again). Both
  // calls are idempotent + internally safe (never throw). This is the single
  // rule that makes "a missed/rejected order never burns the offer" hold for
  // every campaign. Luigi 2026-06-09.
  if (newStatus === "completed") {
    await redeemCouponsForOrder(id);
    // Reward Dollars: spent credit becomes permanent + auto-earn is awarded
    // (both idempotent per order). Mirrors the coupon lifecycle. Luigi 2026-06-27.
    await redeemRewardForOrder(id);
    await awardRewardForOrder({ orderId: id });
    // Configurable earn rules (first-order / order-over / nth-order bonuses).
    await awardEarnRulesForOrder({ orderId: id });
    // Credit granted via a "Grant Reward Dollars" promotion/special on this order.
    await awardPromoCreditsForOrder({ orderId: id });
  } else if (newStatus === "rejected" || newStatus === "cancelled") {
    await releaseCouponsForOrder(id);
    // Reward Dollars: return any spent credit to the customer's wallet.
    await releaseRewardForOrder(id);
    // If the order was already COMPLETED, the spend is "redeemed" and the
    // release above is a NO-OP — refundRewardForOrder makes the wallet whole:
    // returns the redeemed spend AND claws back the credit earned on the
    // order. Idempotent per order (skips a spend the release already
    // returned; one guarded "reverse" row). Runs on the STATUS transition —
    // not inside the card-refund callback — because the wallet portion was
    // never captured online (the charge was total − creditApplied), so it
    // must restore even for cash orders and even if a card refund errors.
    // Without this, a complete→cancel refund permanently ate the customer's
    // store credit (launch Blocker #8).
    await refundRewardForOrder(id);
    // Promotion usage give-back so a "max N uses" promo isn't burned by an
    // unfulfilled order (audit B11). Deletes this order's PromotionUsage ledger
    // rows and decrements usedCount per row actually deleted — IDEMPOTENT (a
    // repeat or concurrent double-kill deletes nothing the 2nd time, so no double
    // give-back) and CAP-INDEPENDENT. The status gate is now just a cheap
    // optimisation to skip the query on an already-killed order; correctness no
    // longer depends on it. Luigi 2026-06-30 (B5 ledger).
    if (existing.status !== "rejected" && existing.status !== "cancelled") {
      await releasePromotionUsageForOrder(id);
    }
  }

  // ── Kill flow: void vs refund ────────────────────────────────────────────
  // When the restaurant rejects/cancels an order, what happens depends on
  // whether the card was already captured:
  //
  //   - paymentStatus = "authorized"  → just a hold, no money moved yet.
  //       Call voidPayment to release the authorization. Customer never
  //       sees a charge. No Stripe fee, no refund mechanics. This is the
  //       common path because most rejections happen BEFORE the kitchen
  //       accepts (i.e. before we capture).
  //
  //   - paymentStatus = "paid"  → money already moved. Need a real refund.
  //       This is rare (post-accept cancellation) but still has to work.
  //
  //   - paymentStatus = "voided" / "refunded" → already in a terminal state,
  //       nothing more to do.
  const isKilled = newStatus === "cancelled" || newStatus === "rejected";
  if (isKilled && existing.paymentIntentId) {
    const piId = existing.paymentIntentId;
    if (existing.paymentStatus === "authorized") {
      // Void the authorization — no charge, no fee, no refund.
      after(
        (async () => {
          try {
            await voidPayment({
              paymentIntentId: piId,
              restaurantId: existing.restaurantId,
            });
            // Key-only model: no webhook backstop — flip paymentStatus to
            // "voided" here so the admin UI updates immediately.
            await prisma.order.update({
              where: { id },
              data: { paymentStatus: "voided" },
            });
          } catch (e) {
            console.error("[orders PATCH] voidPayment:", e);
            // Best-effort: if the void call fails (e.g. authorization
            // already expired and was auto-released by Stripe), the
            // customer is still fine — there was never a charge.
          }
        })(),
      );
    } else if (
      existing.paymentStatus === "paid" ||
      existing.paymentStatus === "partially_refunded"
    ) {
      // Real refund — post-capture cancellation. Also covers an order that
      // was PARTIALLY refunded earlier: refundDirectPayment with no amount
      // refunds Stripe's remaining balance, so cancelling refunds the rest.
      // The card only ever captured total − creditApplied (Reward Dollars
      // paid the rest and are restored separately above), so that's the cap
      // recorded as refundedAmount. Blocker #8.
      after(
        (async () => {
          try {
            await refundCapturedOrder(
              id, piId, existing.restaurantId,
              Math.round((existing.total - (existing.creditApplied ?? 0)) * 100) / 100,
            );
          } catch (e) {
            console.error("[orders PATCH] refundCapturedOrder:", e);
          }
        })(),
      );
    }
  }

  // PayPal kill flow — same shape: void if authorized, refund if captured.
  // Idempotent on PayPal's side via PayPal-Request-Id keyed by orderId.
  if (
    isKilled &&
    existing.paymentMethod === "paypal" &&
    existing.paypalAuthorizationId
  ) {
    const restaurantId = existing.restaurantId;
    const authId = existing.paypalAuthorizationId;
    const captureId = existing.paypalCaptureId;
    if (existing.paymentStatus === "authorized") {
      after(
        (async () => {
          try {
            await voidPaypalAuthorization({
              restaurantId,
              authorizationId: authId,
              orderId: id,
            });
            await prisma.order.update({
              where: { id },
              data: { paymentStatus: "voided" },
            });
          } catch (e) {
            console.error("[orders PATCH] voidPaypalAuthorization:", e);
            // Best-effort. If PayPal already auto-voided the auth (24h+
            // expiry) the customer is still fine — no money moved.
          }
        })(),
      );
    } else if (existing.paymentStatus === "paid" && captureId) {
      after(
        (async () => {
          try {
            await prisma.order.update({
              where: { id },
              data: { refundStatus: "pending" },
            });
            const r = await refundPaypalCapture({
              restaurantId,
              captureId,
              orderId: id,
              reason: "Restaurant cancelled after acceptance",
            });
            await prisma.order.update({
              where: { id },
              data: {
                paymentStatus: "refunded",
                refundStatus: r.status === "COMPLETED" || r.status === "PENDING" ? "refunded" : "failed",
                // PayPal captured total − creditApplied (Reward Dollars paid
                // the rest and are restored to the wallet separately). Blocker #8.
                ...(r.status === "COMPLETED" || r.status === "PENDING"
                  ? { refundedAmount: Math.max(0, Math.round((existing.total - (existing.creditApplied ?? 0)) * 100) / 100) }
                  : {}),
              },
            });
          } catch (e) {
            console.error("[orders PATCH] refundPaypalCapture:", e);
            await prisma.order.update({
              where: { id },
              data: { refundStatus: "failed" },
            }).catch(() => {});
          }
        })(),
      );
    }
  }

  // ── ShipDay dispatch on accept / cancel on kill ─────────────────────────
  // When the restaurant accepts a delivery order AND has the ShipDay
  // driver pool configured + active, dispatch the order to ShipDay
  // immediately. Fire-and-forget via after() so the kitchen UI doesn't
  // block on the ShipDay API roundtrip — kitchen sees "Accepted" instantly;
  // the shipdayOrderId fills in within a second or two.
  if (newStatus === "accepted" && existing.type === "delivery" && !existing.shipdayOrderId) {
    after(
      (async () => {
        try {
          const should = await shouldDispatchToShipday(existing.restaurantId);
          if (!should) return;
          // Pull the full order + restaurant context now (we couldn't put
          // everything in the existing select — would have been wasteful
          // for orders that don't need it).
          const full = await prisma.order.findUnique({
            where: { id },
            select: {
              orderNumber: true, customerName: true, customerEmail: true,
              customerPhone: true, deliveryAddress: true, deliveryCity: true,
              deliveryZip: true, notes: true, subtotal: true, taxAmount: true,
              deliveryFee: true, tip: true, total: true, preparationTime: true,
              restaurant: { select: { name: true, address: true, city: true, state: true, zip: true, phone: true, lat: true, lng: true } },
            },
          });
          if (!full) return;
          const customerAddress = [full.deliveryAddress, full.deliveryCity, full.deliveryZip].filter(Boolean).join(", ");
          const restaurantAddress = [full.restaurant.address, full.restaurant.city, full.restaurant.state, full.restaurant.zip].filter(Boolean).join(", ");
          if (!customerAddress || !restaurantAddress) {
            console.error("[orders PATCH] ShipDay dispatch skipped — missing address", { orderId: id });
            return;
          }
          const res = await dispatchOrderToShipday(existing.restaurantId, {
            orderId: id,
            orderNumber: full.orderNumber,
            customerName: full.customerName,
            customerEmail: full.customerEmail,
            customerPhone: full.customerPhone,
            customerAddress,
            restaurantName: full.restaurant.name,
            restaurantAddress,
            restaurantPhone: full.restaurant.phone,
            restaurantLat: full.restaurant.lat,
            restaurantLng: full.restaurant.lng,
            subtotal: full.subtotal,
            taxAmount: full.taxAmount,
            deliveryFee: full.deliveryFee,
            tip: full.tip ?? 0,
            total: full.total,
            preparationMinutes: full.preparationTime ?? 30,
            deliveryInstruction: full.notes,
          });
          if (res.ok && res.shipdayOrderId) {
            await prisma.order.update({
              where: { id },
              data: { shipdayOrderId: res.shipdayOrderId, shipdayStatus: "assigned", dispatchedAt: new Date() },
            });
          }
        } catch (e) {
          console.error("[orders PATCH] ShipDay dispatch threw:", e);
        }
      })(),
    );
  }

  // Cancel the ShipDay order if the restaurant kills (rejects/cancels)
  // an order that was already dispatched. Idempotent on the ShipDay side
  // (404 = already cancelled treated as success).
  if (isKilled && existing.shipdayOrderId) {
    const shipdayId = existing.shipdayOrderId;
    const restaurantIdForCancel = existing.restaurantId;
    after(
      (async () => {
        try {
          await cancelShipdayOrder(restaurantIdForCancel, shipdayId);
          await prisma.order.update({
            where: { id },
            data: { shipdayStatus: "cancelled" },
          });
        } catch (e) {
          console.error("[orders PATCH] cancelShipdayOrder:", e);
        }
      })(),
    );
  }

  // Marketplace counter rollback. If this was a marketplace-attributed
  // order whose counter increment landed at create time, peel it back
  // out of the listing's monthly totals so we don't bill the restaurant
  // for an order they never fulfilled. unrecord is idempotent — repeat
  // status flips between cancelled/rejected won't double-decrement.
  if (isKilled && existing.viaMarketplace && existing.marketplaceCounterApplied) {
    const totalCents = Math.round(existing.total * 100);
    const restaurantIdForRollback = existing.restaurantId;
    after(
      (async () => {
        try {
          await unrecordMarketplaceOrder({
            orderId: id,
            restaurantId: restaurantIdForRollback,
            orderTotalCents: totalCents,
          });
        } catch (e) {
          console.error("[orders PATCH] unrecordMarketplaceOrder:", e);
        }
      })(),
    );
  }

  // Smart-link counter rollback — same idea for Marketing Studio links: a
  // rejected/cancelled order shouldn't keep counting toward a flyer/QR link's
  // Orders + Revenue. Idempotent (atomic release), so repeat status flips are
  // safe. Mirrors the marketplace rollback above.
  if (isKilled && existing.smartLinkCounterApplied) {
    const totalCents = Math.round(existing.total * 100);
    after(
      (async () => {
        try {
          await unrecordSmartLinkOrder({ orderId: id, orderTotalCents: totalCents });
        } catch (e) {
          console.error("[orders PATCH] unrecordSmartLinkOrder:", e);
        }
      })(),
    );
  }

  // ── Notifications ──────────────────────────────────────────────────────
  // All scheduled via after() so the admin's PATCH responds immediately
  // (kitchen UI doesn't wait on Resend/SMS latency) while still
  // guaranteeing the side effect actually runs to completion.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  // Always tell the customer about status changes (toggle is per-status inside notifyCustomer).
  after(
    (async () => {
      try {
        await notifyCustomer({
          restaurantId: order.restaurant.id,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          orderType: order.type,
          customerLocale: order.restaurant.defaultLanguage || "en",
          payload: {
            event: "orderStatusUpdate",
            customerName: order.customerName,
            orderNumber: order.orderNumber,
            status: order.status,
            estimatedReady: order.estimatedReady ? new Date(order.estimatedReady) : undefined,
            rejectionReason: order.rejectionReason || undefined,
            // Status-page link the customer clicks to track the order.
            // Without this the email template defaults the button to
            // href="#" and the "View order status" button does nothing
            // (Luigi bug 2026-05-31).
            trackingUrl: restaurantOrderUrl(order.restaurant, `/status/${order.id}`),
            // Payment context — drives the rejected/cancelled refund
            // disclosure ("nothing to refund" / "5-10 business days" /
            // "back to your PayPal balance"). paidOnline derived from
            // paymentStatus history; a non-cash order that ever reached
            // authorized/paid had online money attached.
            paymentMethod: order.paymentMethod || undefined,
            paidOnline:
              order.paymentMethod === "card" || order.paymentMethod === "paypal"
                ? ["authorized", "paid", "refunded"].includes(order.paymentStatus ?? "")
                : false,
          },
        });
      } catch (e) {
        console.error("[notifyCustomer orderStatusUpdate]", e);
      }
    })(),
  );

  // Fan-out to staff recipients based on the new status. Each transition maps
  // to a specific toggle so a restaurant can mute, e.g., dine-in confirmations
  // without losing delivery ones.
  if (newStatus === "accepted") {
    const acceptEvent = staffAcceptEventForOrderType(order.type, !!order.scheduledFor);
    // Store-credit part-payment → the accepted email shows "To collect"
    // (total − credit) instead of the misleading gross total. Feature-gated:
    // nothing reward-related is passed when the program is off. Luigi 2026-07-02.
    const rewardsOn = (order.restaurant as any).rewardsEnabled === true;
    const acceptedCredit = rewardsOn ? Math.max(0, (order as any).creditApplied ?? 0) : 0;
    after(
      (async () => {
        try {
          await notifyStaff({
            restaurantId: order.restaurant.id,
            payload: {
              event: acceptEvent,
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              total: order.total,
              creditApplied: acceptedCredit > 0 ? acceptedCredit : undefined,
              rewardLabel: rewardsOn
                ? ((order.restaurant as any).rewardLabelPlural?.trim() || (order.restaurant as any).rewardLabelSingular?.trim() || null)
                : null,
              // "Collected" (money already captured) vs "To collect" (cash on
              // pickup/delivery still owed).
              paidOnline: order.paymentStatus === "paid",
              dashboardUrl: `${baseUrl}/admin/orders`,
            },
          });
        } catch (e) {
          console.error("[notifyStaff order accepted]", e);
        }
      })(),
    );
  } else if (newStatus === "rejected") {
    after(
      (async () => {
        try {
          await notifyStaff({
            restaurantId: order.restaurant.id,
            payload: {
              event: "orderRejected",
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              reason: order.rejectionReason || undefined,
              dashboardUrl: `${baseUrl}/admin/orders`,
            },
          });
        } catch (e) {
          console.error("[notifyStaff orderRejected]", e);
        }
      })(),
    );
  } else if (newStatus === "cancelled") {
    after(
      (async () => {
        try {
          await notifyStaff({
            restaurantId: order.restaurant.id,
            payload: {
              event: "orderCanceled",
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              dashboardUrl: `${baseUrl}/admin/orders`,
            },
          });
        } catch (e) {
          console.error("[notifyStaff orderCanceled]", e);
        }
      })(),
    );
  }

  return NextResponse.json(order);
}

/**
 * Refund a CAPTURED order. Called from the after() block when an order
 * is killed AFTER the kitchen has already accepted (i.e. the
 * authorize-then-capture flow has already captured). Rare path — most
 * rejections happen before accept and go through voidPayment instead.
 *
 * Direct-charge refunds are simple: no transfer to reverse, no
 * application fee to refund. The money is sitting in the restaurant's
 * Stripe balance, the refund pulls it back out to the customer's card.
 * Can still fail if the restaurant's available balance is insufficient,
 * but that's their problem to resolve with Stripe — the platform isn't
 * involved in the money flow.
 */
async function refundCapturedOrder(
  orderId: string,
  paymentIntentId: string,
  restaurantId: string,
  /** The amount the card actually CAPTURED — total − creditApplied. Reward
   *  Dollars were never part of the online charge (they're restored to the
   *  wallet by refundRewardForOrder on the status transition), so stamping
   *  the full order total here would overstate the card refund. Blocker #8. */
  capturedAmount?: number,
) {
  try {
    await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "pending" } });

    // No amount → Stripe refunds the remaining (unrefunded) balance, so this
    // correctly tops up an order that was already partially refunded.
    await refundDirectPayment({
      paymentIntentId,
      restaurantId,
      reason: "requested_by_customer",
    });

    // Key-only model: no webhook backstop — set paymentStatus → "refunded"
    // inline so the admin UI reflects the terminal state immediately. The
    // card side is now fully refunded, so refundedAmount = what was captured.
    await prisma.order.update({
      where: { id: orderId },
      data: {
        refundStatus: "refunded",
        paymentStatus: "refunded",
        ...(typeof capturedAmount === "number" ? { refundedAmount: Math.max(0, capturedAmount) } : {}),
      },
    });
  } catch (err) {
    console.error("[refund]", err instanceof Error ? err.message : err);
    try {
      await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } });
    } catch (e) {
      // Last-resort: refund AND the refundStatus="failed" write both failed.
      // Log with the orderId so we can fix it up by hand if needed.
      console.error(`[refund] failed to mark order ${orderId} refundStatus=failed`, e);
    }
  }
}
