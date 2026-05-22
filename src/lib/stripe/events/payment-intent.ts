import type Stripe from "stripe";
import prisma from "@/lib/db";
import { fireOrderNotifications } from "@/lib/order-notifications";

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
    // RELEASE the order to the kitchen + send customer email NOW.
    // For card orders, /api/orders POST deferred the fan-out (notifiedAt
    // stayed null). This is the moment payment actually cleared, so the
    // kitchen is allowed to start cooking. fireOrderNotifications is
    // idempotent — Stripe can deliver the same webhook more than once
    // (network retry) and we'll only fan out exactly one time.
    //
    // IMPORTANT: we MUST `await` this call. Without await the promise is
    // abandoned the moment this handler returns — Vercel serverless kills
    // the lambda after the response is sent, taking the in-flight promise
    // with it. We hit this exact bug 2026-05-22 on marketplace order
    // ORD-529226215: payment_intent.succeeded was processed, but
    // notifiedAt stayed null because fire-and-forget was getting cut off.
    // Awaiting keeps the lambda alive until notifications complete (~1-2s
    // typical) and lets exceptions propagate up so Stripe retries the
    // whole webhook on transient Resend failures (still idempotent).
    await fireOrderNotifications(orderId);
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
