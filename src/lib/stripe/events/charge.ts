import type Stripe from "stripe";
import prisma from "@/lib/db";
import { sendBillingNotificationEmail } from "@/lib/email";
import { reverseCommission } from "@/lib/commission";

/**
 * Handle charge.* events.
 *
 * Stripe sends:
 *   - charge.refunded         → Order.refundStatus = "refunded"
 *   - charge.dispute.created  → flag the order for restaurant review
 *
 * The Charge object's metadata is inherited from the PaymentIntent, so we
 * use metadata.orderId to find the Order, same as payment-intent events.
 */
export async function handleChargeEvent(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  const orderId = charge.metadata?.orderId;
  // Subscription charges carry an `invoice` field; customer-order charges
  // carry an `orderId` in metadata. Mutually exclusive in practice.
  const invoiceRef: string | null =
    typeof (charge as any).invoice === "string"
      ? (charge as any).invoice
      : ((charge as any).invoice?.id ?? null);

  if (event.type === "charge.refunded") {
    if (orderId) {
      // Customer-order refund — same as before.
      const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
      if (order) {
        await prisma.order.update({
          where: { id: orderId },
          data: {
            refundStatus: charge.refunded ? "refunded" : "partially_refunded",
          },
        });
      }
      return;
    }
    if (invoiceRef) {
      // Subscription invoice refund — update local SubscriptionInvoice and
      // reverse any commission the reseller earned on it.
      const sub = await prisma.subscriptionInvoice.findUnique({
        where: { stripeInvoiceId: invoiceRef },
        select: { id: true, amountRefundedCents: true },
      });
      if (sub) {
        const refunded = charge.amount_refunded ?? 0;
        await prisma.subscriptionInvoice.update({
          where: { id: sub.id },
          data: { amountRefundedCents: Math.max(sub.amountRefundedCents, refunded) },
        });
        await reverseCommission(sub.id, "invoice refunded").catch((e) =>
          console.error("[stripe] reverseCommission failed", e)
        );
      }
      return;
    }
    return;
  }

  if (event.type === "charge.dispute.created") {
    // Subscription invoice dispute (rare but possible) — flag the invoice
    // and reverse any commission.
    if (invoiceRef) {
      const sub = await prisma.subscriptionInvoice.findUnique({
        where: { stripeInvoiceId: invoiceRef },
        select: { id: true },
      });
      if (sub) {
        await prisma.subscriptionInvoice.update({
          where: { id: sub.id },
          data: { disputed: true },
        });
        await reverseCommission(sub.id, "invoice disputed").catch((e) =>
          console.error("[stripe] reverseCommission failed", e)
        );
      }
    }
    // Order is being disputed by the customer. Flag for restaurant attention.
    console.warn(
      `[stripe] dispute created for charge ${charge.id} (orderId=${orderId ?? "unknown"})`
    );
    const restaurantId = charge.metadata?.restaurantId;
    if (restaurantId) {
      const r = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, email: true },
      });
      if (r?.email) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
        sendBillingNotificationEmail({
          to: r.email,
          restaurantName: r.name,
          subject: "A customer has disputed a charge",
          headline: "Chargeback opened",
          body: `A customer has disputed a recent payment${orderId ? ` (order ${orderId})` : ""}. Review the dispute in your Stripe dashboard and respond before the deadline to contest it.`,
          ctaLabel: "Open Stripe dashboard",
          ctaUrl: "https://dashboard.stripe.com/disputes",
        }).catch(() => {});
        void baseUrl;
      }
    }
  }
}
