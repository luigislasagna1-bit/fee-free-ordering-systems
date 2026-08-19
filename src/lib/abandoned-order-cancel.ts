/**
 * THE single place that knows how to cancel an abandoned, unpaid, never-
 * released order and give back everything it had claimed — mirrors this
 * codebase's existing discipline of one shared release path
 * (verifyAndReleaseOrderPayment) applied to the opposite direction.
 *
 * Two callers, one guard, one rollback:
 *   - the auto-reject cron's abandoned-payment sweep (trigger: "payment_timeout")
 *   - the customer's own "Cancel my order" click on the payment page
 *     (trigger: "customer"), POST /api/public/orders/[id]/cancel-unpaid
 *
 * Both go through the SAME atomic claim, re-asserting the full abandoned
 * condition (status pending|accepted, notifiedAt null, paymentStatus
 * unresolved) at write time — so a payment that resolves in the same instant
 * always wins and this can never cancel a genuinely paid order. If the claim
 * misses (count 0), the caller gets `not_abandoned` and does nothing further.
 *
 * Luigi 2026-08-17, after two of a customer's three checkouts sat unpaid and
 * indistinguishable from real orders (see order-display-status.ts for the
 * display-side half of that fix). This is the prevention half.
 */
import prisma from "@/lib/db";
import { notifyCustomer } from "@/lib/notifications";
import { releaseCouponsForOrder } from "@/lib/coupon-ledger";
import { releaseForOrder as releaseRewardForOrder } from "@/lib/reward-ledger";
import { releasePromotionUsageForOrder } from "@/lib/promo-usage";
import { syncCustomerTotalsForOrder } from "@/lib/customer-totals";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";
import { unrecordSmartLinkOrder } from "@/lib/marketing-studio";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

/** Statuses an abandoned order can still be in. Auto-accept stamps an unpaid
 *  card/PayPal order "accepted" at CREATE (release stays deferred on
 *  notifiedAt) — so "accepted" belongs here too, not just "pending". */
export const ABANDONED_ORDER_STATUSES = ["pending", "accepted"] as const;
/** paymentStatus values that mean "never settled" — mirrors UNRESOLVED in
 *  reconcile-card-payments.ts plus "failed" (a declined card the webhook
 *  flipped) and "voided" (auth already released). "paid"/"authorized" are
 *  never in here — those orders are real and must never match this sweep. */
export const ABANDONED_PAYMENT_STATUSES = ["pending", "requires_action", "processing", "failed", "voided"] as const;

export type AbandonedCancelTrigger = "customer" | "payment_timeout";

export type AbandonedCancelResult =
  | { cancelled: true; orderNumber: string; restaurantId: string }
  | { cancelled: false; reason: "not_found" | "not_abandoned" };

export async function cancelAbandonedOrder(
  orderId: string,
  trigger: AbandonedCancelTrigger,
  now: Date = new Date(),
): Promise<AbandonedCancelResult> {
  const rejectionReason =
    trigger === "payment_timeout"
      ? "Payment was not completed within the checkout window. The order was cancelled automatically."
      : "Customer cancelled from the payment page before completing checkout.";

  // Atomic claim — re-asserts the FULL abandoned condition so (a) two
  // triggers racing each other (cron + customer click) can't both cancel,
  // and (b) a payment that succeeds concurrently (which sets notifiedAt +
  // paymentStatus "paid"/"authorized") makes this guard MISS, so a just-paid
  // order is never cancelled out from under the customer. Identical shape to
  // the guard that used to live inline in auto-reject-orders.ts.
  const claimed = await prisma.order.updateMany({
    where: {
      id: orderId,
      status: { in: [...ABANDONED_ORDER_STATUSES] },
      notifiedAt: null,
      paymentStatus: { in: [...ABANDONED_PAYMENT_STATUSES] },
    },
    data: {
      status: "cancelled",
      rejectedAt: now,
      rejectionReason,
      cancelledBy: trigger,
    },
  });
  if (claimed.count === 0) {
    const exists = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
    return exists ? { cancelled: false, reason: "not_abandoned" } : { cancelled: false, reason: "not_found" };
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, orderNumber: true, restaurantId: true, type: true,
      customerName: true, customerEmail: true, customerId: true, customerLocale: true,
      paymentMethod: true, paymentStatus: true, creditApplied: true, total: true,
      viaMarketplace: true, marketplaceCounterApplied: true, smartLinkCounterApplied: true,
      restaurant: {
        select: {
          id: true, name: true, slug: true, subdomain: true,
          customDomain: true, customDomainStatus: true,
          defaultLanguage: true, rewardsEnabled: true,
          rewardLabelSingular: true, rewardLabelPlural: true,
        },
      },
    },
  });
  // Claim succeeded but the row vanished before the re-read (impossible in
  // practice — orders are never hard-deleted). Nothing left to roll back.
  if (!order) return { cancelled: true, orderNumber: "", restaurantId: "" };

  // Give back everything this order had claimed — same rollback the cron and
  // the customer self-cancel route already do. Idempotent + internally safe.
  await releaseCouponsForOrder(order.id);
  await releaseRewardForOrder(order.id);
  await releasePromotionUsageForOrder(order.id);
  await syncCustomerTotalsForOrder(order.id);

  if (order.viaMarketplace && order.marketplaceCounterApplied) {
    await unrecordMarketplaceOrder({
      orderId: order.id,
      restaurantId: order.restaurantId,
      orderTotalCents: Math.round(order.total * 100),
    }).catch((e) => console.error("[abandoned-order-cancel] unrecordMarketplaceOrder failed", e));
  }
  if (order.smartLinkCounterApplied) {
    await unrecordSmartLinkOrder({
      orderId: order.id,
      orderTotalCents: Math.round(order.total * 100),
    }).catch((e) => console.error("[abandoned-order-cancel] unrecordSmartLinkOrder failed", e));
  }

  // Customer notification — the gap this whole change closes. Awaited (not
  // fire-and-forget): this function has no HTTP `after()` lifecycle of its
  // own to lean on since it's called from both a route handler and a cron,
  // so it takes responsibility for finishing its own side effects itself.
  await notifyCustomer({
    restaurantId: order.restaurant.id,
    customerEmail: order.customerEmail,
    customerId: order.customerId ?? null,
    orderType: order.type,
    customerLocale: order.customerLocale || order.restaurant.defaultLanguage || "en",
    payload: {
      event: "orderStatusUpdate",
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: "cancelled",
      cancelledBy: trigger,
      // "customer" reuses the existing, already-translated self-cancel copy
      // ("You cancelled your order…") with no reason line — same shape as
      // /api/public/orders/[id]/cancel. "payment_timeout" gets its own copy
      // (OrderStatusUpdate.tsx isAbandonedPaymentCancel) plus this reason,
      // which only the SMS renders verbatim (sms.cancelledReason).
      ...(trigger === "payment_timeout" ? { rejectionReason } : {}),
      paymentMethod: order.paymentMethod || undefined,
      // Always false for this sweep by construction — the guard only ever
      // matches paymentStatus values that mean nothing was ever taken.
      paidOnline: false,
      ...(order.restaurant.rewardsEnabled === true && (order.creditApplied ?? 0) > 0
        ? {
            creditApplied: order.creditApplied ?? 0,
            rewardLabel:
              order.restaurant.rewardLabelPlural?.trim() ||
              order.restaurant.rewardLabelSingular?.trim() ||
              null,
          }
        : {}),
      trackingUrl: restaurantOrderUrl(order.restaurant, `/status/${order.id}`),
    },
  }).catch((e: unknown) => console.error("[abandoned-order-cancel] notifyCustomer failed", e));

  // No staff ping: notifiedAt was always null on every order this function
  // touches — the kitchen never saw it, so a "cancelled" notification would
  // be pure noise (same reasoning as the existing self-cancel route).

  return { cancelled: true, orderNumber: order.orderNumber, restaurantId: order.restaurantId };
}
