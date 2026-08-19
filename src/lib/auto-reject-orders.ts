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
import { resolveRewardLabel, orderShowsCredit } from "@/lib/reward-label";
import { refundDirectPayment, voidPayment } from "@/lib/stripe";
import { releaseCouponsForOrder } from "@/lib/coupon-ledger";
import { releaseForOrder as releaseRewardForOrder, refundForOrder as refundRewardForOrder } from "@/lib/reward-ledger";
import { releasePromotionUsageForOrder } from "@/lib/promo-usage";
import { syncCustomerTotalsForOrder } from "@/lib/customer-totals";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";
import { unrecordSmartLinkOrder } from "@/lib/marketing-studio";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import {
  cancelAbandonedOrder,
  ABANDONED_ORDER_STATUSES,
  ABANDONED_PAYMENT_STATUSES,
} from "@/lib/abandoned-order-cancel";

// The two windows moved to auto-reject-window.ts so the store's new-order email
// can quote the real number without importing this module's prisma/stripe
// weight. This cron remains the thing that ENFORCES them; that file is the
// single source for what they ARE. Luigi 2026-08-12.
// The KitchenDisplay client also triggers an instant reject the moment its
// countdown elapses; this cron is the safety net for when the tablet is offline
// or not loaded.
import { DEFAULT_TIMEOUT_MINUTES, CLOSED_PLACED_TIMEOUT_MINUTES } from "@/lib/auto-reject-window";

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

export async function autoRejectStaleOrders(opts: { now?: Date; timeoutMinutes?: number; restaurantId?: string } = {}): Promise<AutoRejectResult> {
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
  //     4 min, matching the kitchen UI's countdown.
  //   • Closed-when-placed orders: cutoff = alertAt + 15 min. These sit
  //     parked in the queue until the restaurant opens; the 15-min
  //     window starts when alertAt fires, not when the order was placed.
  //     If alertAt is null or still in the future, the order isn't
  //     stale yet — skip.
  const candidates = await prisma.order.findMany({
    where: {
      status: "pending",
      notifiedAt: { not: null },
      ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
      OR: [
        { placedWhileClosed: false, createdAt: { lt: regularCutoff } },
        { placedWhileClosed: true, alertAt: { not: null, lt: closedPlacedCutoff } },
      ],
    },
    select: {
      id: true,
      orderNumber: true,
      // Needed to give back promo global-usage counts on a missed order (B11).
      notifiedAt: true,
      appliedPromos: true,
      paymentMethod: true,
      paymentStatus: true,
      paymentIntentId: true,
      customerEmail: true,
      customerName: true,
      customerLocale: true,
      // Branded-app order-status push keys off the signed-in customer, not
      // the email/name snapshot — without this the select, `customerId` was
      // silently always undefined and the missed-order push never fired.
      customerId: true,
      type: true,
      total: true,
      // Reward Dollars part-payment — the card refund only covers what was
      // captured (total − creditApplied); the credit restores via the reward
      // ledger release/refund. Blocker #8.
      creditApplied: true,
      restaurantId: true,
      viaMarketplace: true,
      marketplaceCounterApplied: true,
      smartLinkCounterApplied: true,
      placedWhileClosed: true,
      restaurant: {
        select: { id: true, name: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true, defaultLanguage: true, stripeAccountId: true, rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true },
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
  // Window: 10 min (tightened from 30, Luigi 2026-08-17). This is now the
  // BACKSTOP for the tail a client-side guard on the payment page can't catch
  // (force-quit, dead battery, dropped connection, or dismissing the
  // beforeunload prompt) — a customer who deliberately clicks "Cancel my
  // order" is cancelled INSTANTLY via the same cancelAbandonedOrder() below,
  // called from POST /api/public/orders/[id]/cancel-unpaid. 10 minutes stays
  // comfortably longer than a slow 3D Secure/bank-app challenge while cutting
  // the old 30-minute limbo window by two-thirds.
  const ABANDONED_TIMEOUT_MINUTES = 10;
  const abandonedCutoff = new Date(now.getTime() - ABANDONED_TIMEOUT_MINUTES * 60 * 1000);
  // Covers every UNPAID, never-released order (money never moved, kitchen never
  // saw it):
  //   • paymentStatus "pending"         — checkout never authorized.
  //   • paymentStatus "requires_action" — 3D Secure / SCA challenge abandoned.
  //   • paymentStatus "processing"      — bank-debit that never resolved.
  //   • paymentStatus "failed"          — card declined (the webhook flips it to
  //                                       "failed"; nothing else cancels it).
  //   • paymentStatus "voided"          — auth voided / PaymentIntent canceled.
  // status is "pending" OR "accepted": auto-accept (restaurant.autoAcceptOrders)
  // stamps a CARD order "accepted" at CREATE while its release stays deferred
  // (notifiedAt null) until payment — so an abandoned auto-accepted card order is
  // "accepted" + notifiedAt:null and the kitchen-stale sweep above (which requires
  // notifiedAt) never sees it. notifiedAt:null keeps every genuinely-paid order
  // (notifiedAt set + paymentStatus "paid") safely OUT of this sweep.
  //
  // The actual claim + rollback + customer notification now lives in
  // cancelAbandonedOrder() (src/lib/abandoned-order-cancel.ts) — the SAME
  // function the instant customer-initiated cancel calls, so there is exactly
  // one place that knows how to correctly cancel an abandoned order. This
  // query only needs `id` — the shared function re-fetches what it needs.
  const abandoned = await prisma.order.findMany({
    where: {
      status: { in: [...ABANDONED_ORDER_STATUSES] },
      notifiedAt: null,
      ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
      paymentStatus: { in: [...ABANDONED_PAYMENT_STATUSES] },
      createdAt: { lt: abandonedCutoff },
    },
    select: { id: true },
  });
  for (const o of abandoned) {
    try {
      const r = await cancelAbandonedOrder(o.id, "payment_timeout", now);
      if (r.cancelled) result.abandonedCancelled += 1;
    } catch (e) {
      result.errors.push({
        orderId: o.id,
        reason: `abandoned cleanup failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  if (candidates.length === 0) return result;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";

  for (const order of candidates) {
    // Per-order reason: closed-placed orders saw a 15-min window from
    // alertAt, regulars saw the (configurable) 4-min window. Customer
    // sees this in the rejection email and on the status page.
    const orderTimeout = order.placedWhileClosed ? CLOSED_PLACED_TIMEOUT_MINUTES : timeoutMinutes;
    const reasonText = `Auto-rejected: not accepted within ${orderTimeout} minutes.`;
    try {
      // Idempotent claim — same rule the reservation path below has had all
      // along: only flip a row that's STILL pending (staff may have accepted
      // between the candidate query and here, or another trigger already
      // rejected it). Count 0 = someone else won; skip every side effect —
      // no email, no coupon/credit give-back. Fabrizio cmr6meaaq 2026-07-04.
      const claim = await prisma.order.updateMany({
        where: { id: order.id, status: "pending" },
        data: {
          status: "rejected",
          rejectedAt: now,
          rejectionReason: reasonText,
          cancelledBy: "auto",
        },
      });
      if (claim.count === 0) continue;
      result.rejected += 1;

      // Coupon ledger: a timed-out ("missed") order releases its coupon back to
      // the customer — never burned by an order the restaurant never accepted.
      await releaseCouponsForOrder(order.id);
      // Reward Dollars: a missed order returns any spent credit to the wallet,
      // exactly like a manual reject (orders/[id]/route.ts). Without this, credit
      // spent on an order the kitchen never accepted was stranded in "applied"
      // forever. Idempotent — no-ops when the order spent no credit. (Luigi 2026-06-29)
      await releaseRewardForOrder(order.id);
      // Same for the promo usage cap — give back the slot(s) this missed order
      // consumed (B11). Deletes its PromotionUsage ledger rows + decrements
      // usedCount, idempotently. Luigi 2026-06-30 (B5 ledger).
      await releasePromotionUsageForOrder(order.id);
      // Lifetime counters fall back out of Customer.totalOrders/totalSpent —
      // mirrors the manual kill flows. Idempotent, never throws.
      await syncCustomerTotalsForOrder(order.id);

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
      // Smart-link rollback — an auto-rejected order drops off its flyer/QR
      // link's Orders + Revenue too.
      if (order.smartLinkCounterApplied) {
        unrecordSmartLinkOrder({
          orderId: order.id,
          orderTotalCents: Math.round(order.total * 100),
        }).catch((e) => console.error("[auto-reject smart-link unrecord]", e));
      }

      // Card order: void the authorization (if not yet captured) or
      // refund the captured payment (if the restaurant already accepted
      // and then got auto-rejected somehow — very rare since auto-reject
      // only targets `status:"pending"` orders, but possible if there's
      // a race condition between accept + capture failure paths).
      //
      // Cash and card_in_person orders never collected money, skip.
      const isCard =
        order.paymentMethod === "card" && !!order.paymentIntentId;

      if (isCard) {
        const piId = order.paymentIntentId!;
        const rId = order.restaurantId;

        if (order.paymentStatus === "authorized") {
          // Authorization only — release the hold. No charge, no fee,
          // no refund. The common path.
          try {
            await voidPayment({
              paymentIntentId: piId,
              restaurantId: rId,
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
        } else if (order.paymentStatus === "paid" || order.paymentStatus === "partially_refunded") {
          // Captured (possibly partially refunded already) — refund the
          // remaining balance. refundDirectPayment with no amount refunds
          // whatever is left unrefunded on the PaymentIntent.
          try {
            await prisma.order.update({
              where: { id: order.id },
              data: { refundStatus: "pending" },
            });
            await refundDirectPayment({
              paymentIntentId: piId,
              restaurantId: rId,
              reason: "requested_by_customer",
            });
            await prisma.order.update({
              where: { id: order.id },
              data: {
                refundStatus: "refunded",
                paymentStatus: "refunded",
                // The card only captured total − creditApplied; the Reward
                // Dollars part restores to the wallet, not the card. Blocker #8.
                refundedAmount: Math.max(0, Math.round((order.total - (order.creditApplied ?? 0)) * 100) / 100),
              },
            });
            // Belt-and-suspenders wallet restore for the captured branch: the
            // releaseRewardForOrder above already returned an "applied" spend
            // (auto-reject only targets pending orders, so the spend is never
            // "redeemed" here) — this covers any exotic state where it WAS,
            // and claws back order-tied earned credit. Idempotent no-op
            // otherwise. Blocker #8.
            await refundRewardForOrder(order.id);
            result.refunded += 1;

            // ── Receipt for the refund ──────────────────────────────────────
            // A missed order that was ALREADY PAID gets a real refund here, and
            // until 2026-07-31 no email ever stated the amount: this path never
            // sent one, and the Stripe webhook backstop cannot cover it (it
            // skips while refundStatus is "pending" and then no-ops because
            // refundedAmount is already stamped). The customer only got the
            // "we couldn't get to your order" note. Same sender and shape as
            // the manual refund route.
            try {
              const refundedMajor = Math.max(0, Math.round((order.total - ((order as any).creditApplied ?? 0)) * 100) / 100);
              const cust = (order as any).customerEmail as string | null | undefined;
              if (refundedMajor > 0 && cust) {
                const r = await prisma.restaurant.findUnique({
                  where: { id: rId },
                  select: { name: true, email: true, currency: true, defaultLanguage: true, rewardsEnabled: true, rewardLabelPlural: true, rewardLabelSingular: true },
                });
                if (r) {
                  const { sendOrderRefundEmail } = await import("@/lib/email");
                  const { formatCurrency } = await import("@/lib/utils");
                  const creditBack = r.rewardsEnabled === true && ((order as any).creditApplied ?? 0) > 0 ? (order as any).creditApplied as number : 0;
                  await sendOrderRefundEmail({
                    to: cust,
                    restaurantName: r.name,
                    orderNumber: (order as any).orderNumber,
                    customerName: (order as any).customerName ?? "",
                    refundAmountLabel: formatCurrency(refundedMajor, r.currency),
                    isFull: true,
                    creditReturnedLabel: creditBack > 0 ? formatCurrency(creditBack, r.currency) : undefined,
                    rewardLabel: creditBack > 0 ? (r.rewardLabelPlural?.trim() || r.rewardLabelSingular?.trim() || null) : undefined,
                    restaurantEmail: r.email,
                    locale: (order as any).customerLocale || r.defaultLanguage || "en",
                  }).catch((e) => console.error("[auto-reject refund email]", e instanceof Error ? e.message : e));
                }
              }
            } catch (e) {
              // Never let a mail failure affect the refund accounting above.
              console.error("[auto-reject refund email]", e instanceof Error ? e.message : e);
            }
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
      }

      // Customer notification. Fire-and-forget — never block the cron
      // on email/SMS delivery.
      notifyCustomer({
        restaurantId: order.restaurant.id,
        customerEmail: order.customerEmail,
        customerId: order.customerId ?? null,
        orderType: order.type,
        customerLocale: (order as any).customerLocale || order.restaurant.defaultLanguage || "en",
        payload: {
          event: "orderStatusUpdate",
          customerName: order.customerName,
          orderNumber: order.orderNumber,
          status: "rejected",
          rejectionReason: reasonText,
          // Payment context drives the refund disclosure on the rejection
          // email (GloriaFood-parity language: "card → 5-10 business days"
          // etc.). Auto-rejected orders are typically pre-acceptance so
          // paidOnline reflects whether the customer's auth was ever
          // captured / charged; cash orders get the "nothing to refund"
          // line.
          paymentMethod: order.paymentMethod || undefined,
          paidOnline:
            order.paymentMethod === "card" || order.paymentMethod === "paypal"
              ? ["authorized", "paid", "refunded"].includes(order.paymentStatus ?? "")
              : false,
          // Store credit spent on the missed order goes back to the wallet
          // (releaseRewardForOrder above) — say so, or a fully-bucks-paid
          // customer reads "nothing to refund". Feature-gated. 2026-07-11.
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
          orderTotal: order.total,
          ...(orderShowsCredit(order.restaurant as any, order)
            ? { creditApplied: order.creditApplied, rewardLabel: resolveRewardLabel(order.restaurant as any, "") }
            : {}),
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

/**
 * Auto-decline stale PENDING reservations — the booking equivalent of
 * autoRejectStaleOrders (Luigi 2026-06-15 chose full order parity). A
 * non-deposit booking that's sat un-accepted past its accept window — 4 min
 * from createdAt, or 15 min from alertAt for one placed while CLOSED — is
 * declined and the customer emailed (same "declined" email a manual reject
 * sends). Deposit bookings are excluded (they wait on the customer's payment,
 * and an auto-decline there would need a refund). The kitchen client also
 * fires an instant decline the moment the countdown elapses; this cron is the
 * safety net for an offline / unloaded tablet.
 */
export async function autoRejectStaleReservations(opts: { now?: Date; restaurantId?: string } = {}): Promise<{ scanned: number; rejected: number }> {
  const now = opts.now ?? new Date();
  const regularCutoff = new Date(now.getTime() - DEFAULT_TIMEOUT_MINUTES * 60 * 1000);
  const closedPlacedCutoff = new Date(now.getTime() - CLOSED_PLACED_TIMEOUT_MINUTES * 60 * 1000);

  const candidates = await prisma.reservation.findMany({
    where: {
      status: "pending",
      depositAmount: { lte: 0 },
      ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
      OR: [
        { alertAt: null, createdAt: { lt: regularCutoff } },
        { alertAt: { not: null, lt: closedPlacedCutoff } },
      ],
    },
    select: {
      id: true, customerName: true, customerEmail: true, customerLocale: true, partySize: true,
      date: true, time: true, confirmationCode: true, depositAmount: true,
      preOrderTotal: true, restaurantId: true, alertAt: true,
      restaurant: { select: { defaultLanguage: true } },
    },
    take: 100,
  });

  let rejected = 0;
  for (const r of candidates) {
    try {
      // A booking auto-declined for sitting un-accepted past its window is a
      // MISSED booking, not a manual reject — stamp the SAME "Auto-rejected:"
      // marker an order gets so the kitchen badge reads "MISSED" (orange) and
      // the customer email reads "missed", never "rejected"/"declined". A
      // closed-when-placed booking had the 15-min window; a regular one 4 min.
      // Luigi 2026-06-16.
      const mins = r.alertAt ? CLOSED_PLACED_TIMEOUT_MINUTES : DEFAULT_TIMEOUT_MINUTES;
      const reasonText = `Auto-rejected: not accepted within ${mins} minutes.`;
      // Idempotent claim: only flip a row that's STILL pending (staff may have
      // just accepted, or the client trigger already declined it).
      const upd = await prisma.reservation.updateMany({
        where: { id: r.id, status: "pending" },
        data: { status: "rejected", rejectionReason: reasonText, cancelledBy: "auto" },
      });
      if (upd.count === 0) continue;
      rejected += 1;
      if (r.customerEmail) {
        notifyCustomer({
          restaurantId: r.restaurantId,
          customerEmail: r.customerEmail,
          customerLocale: (r as any).customerLocale || r.restaurant.defaultLanguage || "en",
          payload: {
            event: "reservationConfirmation",
            customerName: r.customerName,
            partySize: r.partySize,
            date: r.date,
            time: r.time,
            confirmationCode: r.confirmationCode,
            status: "missed",
            depositAmount: r.depositAmount,
            preOrderTotal: r.preOrderTotal ?? undefined,
          },
        }).catch((e) => console.error("[auto-reject reservation notifyCustomer]", e));
      }
    } catch (e) {
      console.error("[auto-reject-stale-reservations]", r.id, e instanceof Error ? e.message : e);
    }
  }
  console.log(`[auto-reject-stale-reservations] scanned=${candidates.length} rejected=${rejected}`);
  return { scanned: candidates.length, rejected };
}
