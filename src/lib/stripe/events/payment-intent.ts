import type Stripe from "stripe";
import prisma from "@/lib/db";
import { fireOrderNotifications } from "@/lib/order-notifications";

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
    select: { id: true, paymentStatus: true, notifiedAt: true },
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
  }
}
