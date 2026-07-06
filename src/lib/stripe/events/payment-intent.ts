import type Stripe from "stripe";
import prisma from "@/lib/db";
import { fireOrderNotifications } from "@/lib/order-notifications";
import { capturePayment } from "@/lib/stripe";
import { isStripeAlreadyCaptured } from "@/lib/capture-idempotency";

/**
 * Handle payment_intent.* events for customer-to-restaurant orders.
 *
 * The model is GloriaFood-style authorize-then-capture on DIRECT charges:
 *   - Customer places order → PaymentIntent created with capture_method=manual
 *     on the restaurant's CONNECTED account (Stripe-Account header)
 *   - Card authorized → `amount_capturable_updated` fires → we release the
 *     order to the kitchen (notifiedAt set, notifications fanned out).
 *     Money has NOT moved yet — just a hold on the customer's card.
 *   - Kitchen accepts → `/api/orders/[id]` calls `capturePayment` → Stripe
 *     fires `payment_intent.succeeded` AFTER the capture → we mark paid.
 *   - Kitchen rejects pre-capture → `/api/orders/[id]` calls `voidPayment` →
 *     Stripe fires `payment_intent.canceled` → we mark voided. No fee, no
 *     refund. Customer never sees a charge.
 *
 * Connect note: direct-charge events arrive on the platform's webhook
 * endpoint with `event.account` set to the connected account ID. The
 * endpoint must be subscribed to "Events on Connected accounts" in the
 * Stripe dashboard webhook configuration — otherwise these events never
 * arrive and orders silently stay in "pending" paymentStatus forever.
 *
 * The PaymentIntent's `metadata.orderId` is what we set when creating the
 * intent — we use it to find the Order row and update payment status.
 *
 * Stripe sends:
 *   - payment_intent.amount_capturable_updated  → mark Order authorized + release to kitchen
 *   - payment_intent.succeeded                  → mark Order paid (post-capture)
 *   - payment_intent.payment_failed             → mark Order paymentStatus failed
 *   - payment_intent.canceled                   → mark Order paymentStatus voided
 *   - payment_intent.requires_action            → mark Order paymentStatus requires_action.
 *     Fires when the customer's card requires 3D Secure / SCA
 *     challenge (mandatory in EU/UK, increasingly common in CA/US).
 *     The customer is still in checkout completing the challenge —
 *     we don't release the order to the kitchen yet. If they abandon
 *     the challenge the abandoned-payment sweeper picks it up.
 *   - payment_intent.processing                 → mark Order paymentStatus processing.
 *     Alternative payment methods (SEPA, BACS, ACH) take time to
 *     settle. Card payments are usually instant, but bank-debit
 *     methods can sit in "processing" for a few business days.
 *     A final webhook (succeeded / failed) will land later.
 *
 * Bug 2026-05-30 audit: previously `requires_action` and `processing`
 * silently fell through. EU customers paying with a 3D-Secure-required
 * card would get stuck in paymentStatus=pending forever even after
 * authenticating, because the only webhook that fired in some flows
 * was `requires_action` (followed by `amount_capturable_updated` ONLY
 * if the customer finished the challenge in time).
 */
export async function handlePaymentIntentEvent(event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const orderId = intent.metadata?.orderId;
  if (!orderId) {
    // Could be a non-order intent (e.g. setup intent for a saved card). Ignore.
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, paymentStatus: true, notifiedAt: true, status: true, restaurantId: true },
  });
  if (!order) {
    console.warn(`[stripe] payment_intent event for unknown order ${orderId}`);
    return;
  }

  if (event.type === "payment_intent.amount_capturable_updated") {
    // Authorization succeeded. Card is on hold but NOT yet captured.
    // This is the moment we release the order to the kitchen — equivalent
    // to the old payment_intent.succeeded release point under the
    // immediate-capture model.
    //
    // Idempotency: if paymentStatus is already past "authorized" (e.g.
    // Stripe is replaying an old webhook and we've since captured), skip.
    if (order.paymentStatus === "paid" || order.paymentStatus === "refunded") {
      return;
    }
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "authorized",
        paymentIntentId: intent.id,
      },
    });
    // AUTO-ACCEPT capture-on-authorize (Luigi 2026-07-06, stabilization C3).
    // A normal order captures when the kitchen clicks Accept (PATCH
    // /api/orders/[id]). But an AUTO-ACCEPTED order is created with
    // status="accepted" and never hits that path — so without this, the
    // authorization would simply expire (~7 days) and the restaurant would
    // never be paid for food it already cooked. When the order is already
    // accepted, capture the funds NOW so the payment is collected immediately.
    // Gate strictly on status==="accepted" so a normal order (still "pending"
    // at authorize time — the kitchen hasn't seen it yet) keeps capturing only
    // on Accept. Idempotent vs webhook replay: the paid/refunded early-return
    // above skips a second capture; a mid-capture DB failure self-heals because
    // isStripeAlreadyCaptured treats the retry as success. A capture FAILURE
    // must NOT block releasing the order to the kitchen — leave it "authorized"
    // (the kitchen still sees it; a manual re-accept or reconcile can retry).
    if (order.status === "accepted") {
      try {
        await capturePayment({ paymentIntentId: intent.id, restaurantId: order.restaurantId });
        await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "paid" } });
      } catch (e) {
        if (isStripeAlreadyCaptured(e)) {
          await prisma.order.update({ where: { id: orderId }, data: { paymentStatus: "paid" } });
        } else {
          console.error(
            `[stripe] auto-accept capture-on-authorize failed for order ${orderId} — left authorized for retry:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    }
    // IMPORTANT: await — Vercel kills unawaited promises after the
    // webhook 200. fireOrderNotifications is idempotent (notifiedAt guard).
    await fireOrderNotifications(orderId);
  } else if (event.type === "payment_intent.succeeded") {
    // Capture completed — money has actually moved from the customer's
    // card into the restaurant's Stripe balance. Mark as paid.
    //
    // For older orders created under the immediate-capture model, this
    // is still the release point — call fireOrderNotifications to cover
    // both old and new flows (idempotent on notifiedAt).
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "paid",
        paymentIntentId: intent.id,
      },
    });
    await fireOrderNotifications(orderId);
  } else if (event.type === "payment_intent.payment_failed") {
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: "failed" },
    });
  } else if (event.type === "payment_intent.canceled") {
    // Authorization voided — either by us via voidPayment() during a
    // pre-capture reject, or by Stripe auto-releasing after the hold
    // window expired. Either way, no money moved, no refund needed.
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: "voided" },
    });
  } else if (event.type === "payment_intent.requires_action") {
    // 3D Secure / SCA challenge in progress. DO NOT release to kitchen
    // — the customer hasn't actually paid yet, they're still completing
    // the bank's auth challenge in another window. We track the state
    // so the admin orders view can show "Awaiting authentication"
    // instead of a confusing bare "pending".
    //
    // If the customer finishes the challenge, the PaymentIntent
    // transitions to `amount_capturable_updated` (manual capture) or
    // `succeeded` (auto capture) and we resume the normal flow there.
    //
    // If the customer abandons, the PaymentIntent eventually fails or
    // the abandoned-payment cron (auto-reject-stale-orders) cancels
    // the order after 30 min. Either way no money moved.
    //
    // Idempotency: only step DOWN from "pending" to "requires_action".
    // If we've already advanced to authorized/paid/voided, ignore the
    // late event.
    if (order.paymentStatus === "pending") {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: "requires_action", paymentIntentId: intent.id },
      });
    }
  } else if (event.type === "payment_intent.processing") {
    // Bank-debit-style payment methods (SEPA, BACS, ACH) sit in
    // "processing" for hours-to-days while the bank confirms the
    // debit. Cards are usually instant; this only fires for alternate
    // methods. We DO NOT release to the kitchen here — the funds
    // aren't confirmed yet. Wait for the eventual `succeeded` or
    // `payment_failed` webhook.
    if (order.paymentStatus === "pending" || order.paymentStatus === "requires_action") {
      await prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: "processing", paymentIntentId: intent.id },
      });
    }
  } else {
    // Unknown event type for our payment_intent dispatcher. Log so we
    // catch Stripe-added events in prod. Returning success is fine —
    // unhandled is not a failure.
    console.warn(`[stripe] unhandled payment_intent event type: ${event.type} (order=${orderId})`);
  }
}
