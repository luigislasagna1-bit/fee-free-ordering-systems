import prisma from "@/lib/db";
import { getRestaurantStripe } from "@/lib/stripe";
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
      paymentMethod: true,
      paymentStatus: true,
      paymentIntentId: true,
    },
  });
  if (!order) return null;

  // Only card orders go through Stripe. Cash / pay-in-person never had a
  // PaymentIntent.
  if (order.paymentMethod !== "card") return order.paymentStatus;

  // Already in a settled/advanced state — nothing to do. fireOrderNotifications
  // is idempotent but we avoid a needless Stripe round-trip on every poll.
  if (
    order.paymentStatus === "authorized" ||
    order.paymentStatus === "paid" ||
    order.paymentStatus === "refunded" ||
    order.paymentStatus === "voided"
  ) {
    return order.paymentStatus;
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
