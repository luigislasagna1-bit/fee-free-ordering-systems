import type Stripe from "stripe";
import prisma from "@/lib/db";

/**
 * Handle payment_intent.* events for customer-to-restaurant orders (Layer C).
 *
 * The PaymentIntent's `metadata.orderId` is what we set when creating the
 * intent in `createDestinationPaymentIntent()` — we use it to find the Order
 * row and update payment status.
 *
 * Stripe sends:
 *   - payment_intent.succeeded       → mark Order paid
 *   - payment_intent.payment_failed  → mark Order paymentStatus failed
 *   - payment_intent.canceled        → mark Order canceled
 */
export async function handlePaymentIntentEvent(event: Stripe.Event) {
  const intent = event.data.object as Stripe.PaymentIntent;
  const orderId = intent.metadata?.orderId;
  if (!orderId) {
    // Could be a non-order intent (e.g. setup intent for a saved card). Ignore.
    return;
  }

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) {
    console.warn(`[stripe] payment_intent event for unknown order ${orderId}`);
    return;
  }

  if (event.type === "payment_intent.succeeded") {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: "paid",
        paymentIntentId: intent.id,
      },
    });
  } else if (event.type === "payment_intent.payment_failed") {
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: "failed" },
    });
  } else if (event.type === "payment_intent.canceled") {
    await prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: "canceled" },
    });
  }
}
