/**
 * Auto-reject stale pending orders.
 *
 * A pending order that's been sitting in the kitchen queue past the
 * timeout window (default 10 min from createdAt) almost certainly
 * means the restaurant isn't going to accept it — the customer is
 * waiting, expecting food they'll never get. The fair thing is to
 * auto-reject and refund their card so they can order elsewhere.
 *
 * Runs from /api/cron/auto-reject-stale-orders every few minutes.
 */

import prisma from "@/lib/db";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { refundDestinationPayment, stripeReady } from "@/lib/stripe";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";

/** Minutes a pending order can sit before we auto-reject. Conservative
 *  default — kitchen countdown shows URGENT after 3 min, so 10 min is
 *  ample warning. Tunable via AUTO_REJECT_TIMEOUT_MINUTES env if needed. */
const DEFAULT_TIMEOUT_MINUTES = 10;

export type AutoRejectResult = {
  scanned: number;
  rejected: number;
  refunded: number;
  refundFailed: number;
  errors: Array<{ orderId: string; reason: string }>;
};

export async function autoRejectStaleOrders(opts: { now?: Date; timeoutMinutes?: number } = {}): Promise<AutoRejectResult> {
  const now = opts.now ?? new Date();
  const envValue = parseInt(process.env.AUTO_REJECT_TIMEOUT_MINUTES ?? "", 10);
  const timeoutMinutes =
    opts.timeoutMinutes ?? (Number.isFinite(envValue) && envValue > 0 ? envValue : DEFAULT_TIMEOUT_MINUTES);
  const cutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000);

  // Pending orders that have been released to the kitchen (notifiedAt
  // set) and have sat for too long. Released card orders are the
  // important ones — the customer already paid, expects either food
  // or a refund. Unreleased card orders (paid not yet → notifiedAt
  // null) are still in payment-confirmation limbo; skip those.
  const candidates = await prisma.order.findMany({
    where: {
      status: "pending",
      notifiedAt: { not: null },
      createdAt: { lt: cutoff },
    },
    select: {
      id: true,
      orderNumber: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentIntentId: true,
      customerEmail: true,
      customerName: true,
      type: true,
      total: true,
      restaurantId: true,
      viaMarketplace: true,
      marketplaceCounterApplied: true,
      restaurant: { select: { id: true, name: true, defaultLanguage: true } },
    },
  });

  const result: AutoRejectResult = {
    scanned: candidates.length,
    rejected: 0,
    refunded: 0,
    refundFailed: 0,
    errors: [],
  };

  if (candidates.length === 0) return result;

  const stripeOk = await stripeReady();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const reasonText = `Auto-rejected: not accepted within ${timeoutMinutes} minutes.`;

  for (const order of candidates) {
    try {
      await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "rejected",
          rejectedAt: now,
          rejectionReason: reasonText,
        },
      });
      result.rejected += 1;

      // Marketplace counter rollback (idempotent). Auto-rejected
      // marketplace orders shouldn't count toward the restaurant's
      // monthly bill.
      if (order.viaMarketplace && order.marketplaceCounterApplied) {
        unrecordMarketplaceOrder({
          orderId: order.id,
          restaurantId: order.restaurantId,
          orderTotalCents: Math.round(order.total * 100),
        }).catch((e) =>
          console.error("[auto-reject unrecordMarketplaceOrder]", e),
        );
      }

      // Refund if this was a card order that actually charged. Cash
      // and card_in_person orders never collected money, so no refund.
      const collectedMoney =
        order.paymentMethod === "card" &&
        order.paymentStatus === "paid" &&
        !!order.paymentIntentId;

      if (collectedMoney && stripeOk) {
        try {
          await prisma.order.update({
            where: { id: order.id },
            data: { refundStatus: "pending" },
          });
          await refundDestinationPayment({
            paymentIntentId: order.paymentIntentId!,
            refundApplicationFee: true,
            reason: "requested_by_customer",
          });
          await prisma.order.update({
            where: { id: order.id },
            data: { refundStatus: "refunded", paymentStatus: "refunded" },
          });
          result.refunded += 1;
        } catch (e) {
          result.refundFailed += 1;
          result.errors.push({
            orderId: order.id,
            reason: `refund failed: ${e instanceof Error ? e.message : String(e)}`,
          });
          await prisma.order
            .update({ where: { id: order.id }, data: { refundStatus: "failed" } })
            .catch(() => {});
        }
      } else if (collectedMoney && !stripeOk) {
        result.refundFailed += 1;
        result.errors.push({ orderId: order.id, reason: "Stripe not configured" });
      }

      // Customer notification. Fire-and-forget — never block the cron
      // on email/SMS delivery.
      notifyCustomer({
        restaurantId: order.restaurant.id,
        customerEmail: order.customerEmail,
        orderType: order.type,
        customerLocale: order.restaurant.defaultLanguage || "en",
        payload: {
          event: "orderStatusUpdate",
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          status: "rejected",
          rejectionReason: reasonText,
        },
      }).catch((e: unknown) => console.error("[auto-reject notifyCustomer]", e));

      // Staff notification — let owners know an order was auto-rejected
      // on their behalf so they can follow up if it was a mistake.
      notifyStaff({
        restaurantId: order.restaurant.id,
        payload: {
          event: "orderRejected",
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          reason: reasonText,
          dashboardUrl: `${baseUrl}/admin/orders`,
        },
      }).catch((e: unknown) => console.error("[auto-reject notifyStaff]", e));
    } catch (e) {
      result.errors.push({
        orderId: order.id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(
    `[auto-reject-stale-orders] scanned=${result.scanned} rejected=${result.rejected} refunded=${result.refunded} failed=${result.refundFailed}`,
  );
  return result;
}
