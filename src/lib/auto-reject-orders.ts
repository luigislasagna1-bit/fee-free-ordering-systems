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
import { refundDirectPayment, stripeReady, voidPayment } from "@/lib/stripe";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";

/** Minutes a regular pending order can sit before we auto-reject.
 *  Matches the kitchen-display visual countdown (3 min) so the bell
 *  doesn't keep ringing past the URGENT cue. The KitchenDisplay client
 *  also triggers an instant reject the moment the countdown elapses,
 *  but this cron is the safety net for when the tablet is offline /
 *  not loaded. Tunable via AUTO_REJECT_TIMEOUT_MINUTES env. */
const DEFAULT_TIMEOUT_MINUTES = 3;
/** Closed-when-placed orders get a longer window — staff may be a few
 *  minutes late arriving after open, and the kitchen UI gives them
 *  15 min from alertAt before flashing URGENT. Keep auto-reject aligned. */
const CLOSED_PLACED_TIMEOUT_MINUTES = 15;

export type AutoRejectResult = {
  scanned: number;
  rejected: number;
  /** Authorizations released without charging (no money ever moved). The
   *  common path under the authorize-then-capture model — most auto-
   *  rejects happen pre-acceptance so the card was only on hold. */
  voided: number;
  /** Actual refunds processed (post-capture cancellations). Rare path. */
  refunded: number;
  refundFailed: number;
  /** Abandoned-payment orders cleaned up — created but the customer
   *  never finished checkout (paymentStatus stuck "pending" and the
   *  order never made it to the kitchen). Marked "cancelled" with no
   *  refund/void needed because no money was ever moved. */
  abandonedCancelled: number;
  errors: Array<{ orderId: string; reason: string }>;
};

export async function autoRejectStaleOrders(opts: { now?: Date; timeoutMinutes?: number } = {}): Promise<AutoRejectResult> {
  const now = opts.now ?? new Date();
  const envValue = parseInt(process.env.AUTO_REJECT_TIMEOUT_MINUTES ?? "", 10);
  const timeoutMinutes =
    opts.timeoutMinutes ?? (Number.isFinite(envValue) && envValue > 0 ? envValue : DEFAULT_TIMEOUT_MINUTES);
  const regularCutoff = new Date(now.getTime() - timeoutMinutes * 60 * 1000);
  const closedPlacedCutoff = new Date(now.getTime() - CLOSED_PLACED_TIMEOUT_MINUTES * 60 * 1000);

  // Pending orders that have been released to the kitchen (notifiedAt
  // set) and have sat for too long. Released card orders are the
  // important ones — the customer already paid, expects either food
  // or a refund. Unreleased card orders (paid not yet → notifiedAt
  // null) are still in payment-confirmation limbo; skip those.
  //
  // Two timeout buckets:
  //   • Regular orders (placedWhileClosed=false): cutoff = createdAt +
  //     3 min, matching the kitchen UI's countdown.
  //   • Closed-when-placed orders: cutoff = alertAt + 15 min. These sit
  //     parked in the queue until the restaurant opens; the 15-min
  //     window starts when alertAt fires, not when the order was placed.
  //     If alertAt is null or still in the future, the order isn't
  //     stale yet — skip.
  const candidates = await prisma.order.findMany({
    where: {
      status: "pending",
      notifiedAt: { not: null },
      OR: [
        { placedWhileClosed: false, createdAt: { lt: regularCutoff } },
        { placedWhileClosed: true, alertAt: { not: null, lt: closedPlacedCutoff } },
      ],
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
      placedWhileClosed: true,
      restaurant: {
        select: { id: true, name: true, defaultLanguage: true, stripeAccountId: true },
      },
    },
  });

  const result: AutoRejectResult = {
    scanned: candidates.length,
    rejected: 0,
    voided: 0,
    refunded: 0,
    refundFailed: 0,
    abandonedCancelled: 0,
    errors: [],
  };

  // ── Abandoned-payment sweep ────────────────────────────────────────
  // Orders created via Stripe Checkout where the customer never finished
  // payment (paymentStatus stuck "pending" → the webhook that flips to
  // "authorized" never fired). These have `notifiedAt: null` and so are
  // NOT picked up by the kitchen-stale sweep above. Without this
  // sweeper, they'd haunt the customer's account page showing "waiting
  // for confirmation" forever — even though there's nothing to confirm
  // because no payment was ever taken.
  //
  // Window: 30 min. Long enough for slow Stripe webhooks; short enough
  // that the customer's "I'll just place the order again" instinct is
  // honoured before they get confused looking at the stale entry.
  const ABANDONED_TIMEOUT_MINUTES = 30;
  const abandonedCutoff = new Date(now.getTime() - ABANDONED_TIMEOUT_MINUTES * 60 * 1000);
  // Covers three abandonment shapes — all where money never moved and
  // the order never reached the kitchen:
  //   • paymentStatus: "pending"           — checkout never authorized.
  //   • paymentStatus: "requires_action"   — customer started 3D
  //                                          Secure / SCA challenge
  //                                          and abandoned it.
  //   • paymentStatus: "processing"        — bank-debit payment that
  //                                          never resolved (rare,
  //                                          but possible if Stripe
  //                                          loses the webhook).
  const abandoned = await prisma.order.findMany({
    where: {
      status: "pending",
      notifiedAt: null,
      paymentStatus: { in: ["pending", "requires_action", "processing"] },
      createdAt: { lt: abandonedCutoff },
    },
    select: { id: true, orderNumber: true, restaurantId: true, viaMarketplace: true, marketplaceCounterApplied: true, total: true },
  });
  for (const o of abandoned) {
    try {
      await prisma.order.update({
        where: { id: o.id },
        data: {
          status: "cancelled",
          rejectedAt: now,
          rejectionReason:
            "Payment was not completed within the checkout window. The order was cancelled automatically.",
        },
      });
      result.abandonedCancelled += 1;
      // Marketplace attribution shouldn't include orders that never paid.
      // (For belt-and-suspenders — usually marketplaceCounterApplied is
      // false on never-paid orders, but the rollback is idempotent.)
      if (o.viaMarketplace && o.marketplaceCounterApplied) {
        unrecordMarketplaceOrder({
          orderId: o.id,
          restaurantId: o.restaurantId,
          orderTotalCents: Math.round(o.total * 100),
        }).catch((e) => console.error("[auto-reject abandoned unrecord]", e));
      }
    } catch (e) {
      result.errors.push({
        orderId: o.id,
        reason: `abandoned cleanup failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  if (candidates.length === 0) return result;

  const stripeOk = await stripeReady();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  for (const order of candidates) {
    // Per-order reason: closed-placed orders saw a 15-min window from
    // alertAt, regulars saw the (configurable) 3-min window. Customer
    // sees this in the rejection email and on the status page.
    const orderTimeout = order.placedWhileClosed ? CLOSED_PLACED_TIMEOUT_MINUTES : timeoutMinutes;
    const reasonText = `Auto-rejected: not accepted within ${orderTimeout} minutes.`;
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

      // Card order: void the authorization (if not yet captured) or
      // refund the captured payment (if the restaurant already accepted
      // and then got auto-rejected somehow — very rare since auto-reject
      // only targets `status:"pending"` orders, but possible if there's
      // a race condition between accept + capture failure paths).
      //
      // Cash and card_in_person orders never collected money, skip.
      const isCard =
        order.paymentMethod === "card" && !!order.paymentIntentId && !!order.restaurant.stripeAccountId;

      if (isCard && stripeOk) {
        const piId = order.paymentIntentId!;
        const acctId = order.restaurant.stripeAccountId!;

        if (order.paymentStatus === "authorized") {
          // Authorization only — release the hold. No charge, no fee,
          // no refund. The common path.
          try {
            await voidPayment({
              paymentIntentId: piId,
              restaurantStripeAccountId: acctId,
            });
            await prisma.order.update({
              where: { id: order.id },
              data: { paymentStatus: "voided" },
            });
            result.voided += 1;
          } catch (e) {
            result.errors.push({
              orderId: order.id,
              reason: `void failed: ${e instanceof Error ? e.message : String(e)}`,
            });
            // Best-effort: if void fails (auth already expired), the
            // customer isn't charged anyway. Don't count as refundFailed.
          }
        } else if (order.paymentStatus === "paid") {
          // Captured — need a real refund. Rare path.
          try {
            await prisma.order.update({
              where: { id: order.id },
              data: { refundStatus: "pending" },
            });
            await refundDirectPayment({
              paymentIntentId: piId,
              restaurantStripeAccountId: acctId,
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
            try {
              await prisma.order.update({
                where: { id: order.id },
                data: { refundStatus: "failed" },
              });
            } catch (markErr) {
              console.error(
                `[auto-reject] failed to mark order ${order.id} refundStatus=failed`,
                markErr,
              );
            }
          }
        }
      } else if (isCard && !stripeOk) {
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
    `[auto-reject-stale-orders] scanned=${result.scanned} rejected=${result.rejected} voided=${result.voided} refunded=${result.refunded} failed=${result.refundFailed}`,
  );
  return result;
}
