import prisma from "@/lib/db";
import { getRestaurantStripe, capturePayment } from "@/lib/stripe";
import { isStripeAlreadyCaptured } from "@/lib/capture-idempotency";
import { fireOrderNotifications } from "@/lib/order-notifications";

/**
 * KEY-ONLY model replacement for the Stripe webhook.
 *
 * Under Stripe Connect, customer-payment state transitions
 * (pending → authorized → paid) were driven by webhooks the PLATFORM
 * received for events on connected accounts. In the key-only model the
 * restaurant uses their OWN Stripe account, which webhooks to THEIR OWN
 * endpoints — never to us. So we verify the PaymentIntent server-side
 * ourselves, using the restaurant's own secret key, at the moment the
 * customer lands back on the confirmation page after `confirmPayment`.
 *
 * This is the point where a card order is RELEASED TO THE KITCHEN
 * (fireOrderNotifications sets notifiedAt + fans out the new-order
 * alerts) — exactly mirroring the old `amount_capturable_updated`
 * webhook handler. Without this, card orders would never reach the
 * kitchen.
 *
 * Fully idempotent: safe to call on every confirmation-page render and
 * every status-page poll. Returns the resolved paymentStatus (or null
 * when nothing could be verified — caller should not treat that as an
 * error; the order simply stays where it was).
 *
 * Security: we NEVER trust the client-supplied `paymentIntentId` to
 * mutate an arbitrary order. We retrieve the intent from Stripe and
 * require `intent.metadata.orderId === orderId` before touching the row.
 */
export async function verifyAndReleaseOrderPayment(params: {
  orderId: string;
  /** The `payment_intent` query param Stripe appends to the return_url.
   *  Used only as a fallback when the order has no stored intent yet —
   *  always validated against the intent's own metadata.orderId. */
  paymentIntentId?: string | null;
}): Promise<string | null> {
  const order = await prisma.order.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      restaurantId: true,
      status: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentIntentId: true,
    },
  });
  if (!order) return null;

  // Only card orders go through Stripe. Cash / pay-in-person never had a
  // PaymentIntent.
  if (order.paymentMethod !== "card") return order.paymentStatus;

  // Terminal states — nothing left to verify.
  if (
    order.paymentStatus === "paid" ||
    order.paymentStatus === "refunded" ||
    order.paymentStatus === "voided"
  ) {
    return order.paymentStatus;
  }

  // "authorized" is normally terminal for verify — EXCEPT for an auto-accepted
  // order (status already "accepted"): the funds are only held, not captured,
  // and the capture must still happen here because the pending→accepted PATCH
  // that normally captures never runs for auto-accept. Letting accepted+
  // authorized fall through also lets a later poll RETRY a capture whose first
  // attempt failed. A normal (manually-accepted) authorized order early-returns
  // — its capture happens on the Accept PATCH. (LR-PAY-01 fix, 2026-07-10.)
  if (order.paymentStatus === "authorized" && order.status !== "accepted") {
    return "authorized";
  }

  const intentId = order.paymentIntentId || params.paymentIntentId || null;
  if (!intentId) return order.paymentStatus;

  const rs = await getRestaurantStripe(order.restaurantId);
  if (!rs) return order.paymentStatus;

  let intent;
  try {
    intent = await rs.client.paymentIntents.retrieve(intentId);
  } catch (e) {
    console.error(
      `[verify-payment] retrieve failed for order ${order.id}:`,
      e instanceof Error ? e.message : e,
    );
    return order.paymentStatus;
  }

  // Hard ownership check — the intent must belong to THIS order.
  if (intent.metadata?.orderId !== order.id) {
    console.warn(
      `[verify-payment] intent ${intent.id} metadata.orderId mismatch for order ${order.id} — ignoring`,
    );
    return order.paymentStatus;
  }

  switch (intent.status) {
    case "requires_capture": {
      // Authorized (manual-capture hold placed). Release to the kitchen.
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "authorized", paymentIntentId: intent.id },
      });
      // AUTO-ACCEPT: if the order is already "accepted", the pending→accepted
      // PATCH that normally captures never runs, so capture NOW or the
      // restaurant is never paid for food it will make (LR-PAY-01). Mirrors the
      // platform-webhook fix in events/payment-intent.ts. A capture FAILURE
      // must not block releasing the order to the kitchen — leave it
      // "authorized" (a later poll retries via the fall-through above);
      // isStripeAlreadyCaptured treats a mid-capture DB-write failure as done.
      if (order.status === "accepted") {
        try {
          await capturePayment({ paymentIntentId: intent.id, restaurantId: order.restaurantId });
          await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
          await fireOrderNotifications(order.id);
          return "paid";
        } catch (e) {
          if (isStripeAlreadyCaptured(e)) {
            await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
            await fireOrderNotifications(order.id);
            return "paid";
          }
          console.error(
            `[verify-payment] auto-accept capture failed for order ${order.id} — left authorized for retry:`,
            e instanceof Error ? e.message : String(e),
          );
        }
      }
      await fireOrderNotifications(order.id);
      return "authorized";
    }
    case "succeeded": {
      // Already captured (shouldn't happen pre-accept, but handle it).
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "paid", paymentIntentId: intent.id },
      });
      await fireOrderNotifications(order.id);
      return "paid";
    }
    case "requires_action": {
      if (order.paymentStatus === "pending") {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "requires_action", paymentIntentId: intent.id },
        });
        return "requires_action";
      }
      return order.paymentStatus;
    }
    case "processing": {
      if (order.paymentStatus === "pending" || order.paymentStatus === "requires_action") {
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "processing", paymentIntentId: intent.id },
        });
        return "processing";
      }
      return order.paymentStatus;
    }
    case "canceled": {
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "voided" },
      });
      return "voided";
    }
    default:
      // requires_payment_method / requires_confirmation — customer hasn't
      // finished paying. Leave the order where it is.
      return order.paymentStatus;
  }
}
