/**
 * POST /api/public/orders/[id]/cancel   body: { token?: string }
 *
 * Customer-initiated cancellation (GloriaFood parity — Fabrizio cms0idtz7).
 * Authorized when EITHER:
 *   • the caller owns the order via a session (per-restaurant Customer or
 *     marketplace CustomerAccount), OR
 *   • the request carries the purpose-scoped "order-cancel" HMAC token from
 *     the confirmation email (guests — no account needed). The token is in
 *     the POST body (not the query) so it stays out of server logs; a GET
 *     with the token only ever OPENS the confirm UI (mail-scanner-safe).
 *
 * State precondition: the order must still be "pending" (kitchen hasn't
 * accepted). The transition is an IDEMPOTENT CLAIM (updateMany guarded on
 * status:"pending", same pattern as the auto-reject cron) so a concurrent
 * kitchen Accept can never be overwritten — whoever flips the status first
 * wins, and the loser skips every side effect.
 *
 * On success:
 *   • status="cancelled", rejectedAt, rejectionReason, cancelledBy="customer"
 *     (the kitchen renders "Cancelled by the customer" from the column).
 *   • Coupons / Reward Dollars / promo-usage released.
 *   • Stripe pre-capture authorization VOIDED (never refund — a pending
 *     order was authorized, not captured). PayPal authorization voided.
 *   • Linked reservation (reserve-then-order) synced to cancelled.
 *   • Marketplace + smart-link counters rolled back.
 *   • Customer gets the "cancelled" status email (customer-initiated copy +
 *     per-method hold-release lines); staff get the orderCanceled ping.
 *
 * Error responses carry stable `code`s the status page maps to translated
 * strings; the English `error` text is a fallback only.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { getCurrentCustomer } from "@/lib/customer-session";
import { isCancelAuthorized } from "@/lib/customer-cancel-auth";
import { voidPayment } from "@/lib/stripe";
import { voidPaypalAuthorization } from "@/lib/paypal";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";
import { unrecordSmartLinkOrder } from "@/lib/marketing-studio";
import { releaseCouponsForOrder } from "@/lib/coupon-ledger";
import { releaseForOrder as releaseRewardForOrder } from "@/lib/reward-ledger";
import { releasePromotionUsageForOrder } from "@/lib/promo-usage";
import { notifyCustomer, notifyStaff } from "@/lib/notifications";
import { resolveRewardLabel, orderShowsCredit } from "@/lib/reward-label";
import { restaurantOrderUrl } from "@/lib/restaurant-url";

/**
 * Verify that the current viewer owns `order` by either:
 *   1. Per-restaurant Customer session whose customer.id matches order.customerId
 *   2. Marketplace CustomerAccount session whose id matches order.customer.customerAccountId
 *
 * The two account systems are intentionally separate (Luigi 2026-05-30
 * — "marketplace accounts and per-restaurant accounts are not
 * connected"), so we have to check both paths. Returns null when no
 * valid ownership is established.
 */
async function checkOrderOwnership(orderCustomerId: string | null, expectedRestaurantId: string) {
  // (1) Per-restaurant customer.
  const me = await getCurrentRestaurantCustomer({ expectedRestaurantId });
  if (me && orderCustomerId === me.id) return { kind: "restaurant" as const };

  // (2) Marketplace customer (CustomerAccount). The order's Customer row
  // carries an optional customerAccountId that links it to the
  // marketplace account that placed it.
  const acct = await getCurrentCustomer();
  if (acct && orderCustomerId) {
    const linked = await prisma.customer.findUnique({
      where: { id: orderCustomerId },
      select: { customerAccountId: true },
    });
    if (linked && linked.customerAccountId === acct.id) return { kind: "marketplace" as const };
  }
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : undefined;

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true, orderNumber: true, status: true, customerId: true,
      restaurantId: true, createdAt: true, type: true, notifiedAt: true,
      customerName: true, customerEmail: true, customerPhone: true,
      customerLocale: true,
      creditApplied: true,
      paymentMethod: true, paymentStatus: true, paymentIntentId: true,
      paypalAuthorizationId: true,
      viaMarketplace: true, marketplaceCounterApplied: true, smartLinkCounterApplied: true, total: true,
      restaurant: {
        select: {
          id: true, name: true, slug: true, subdomain: true,
          customDomain: true, customDomainStatus: true,
          defaultLanguage: true, rewardsEnabled: true,
          rewardLabelSingular: true, rewardLabelPlural: true,
          stripeAccountId: true,
        },
      },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found", code: "not_found" }, { status: 404 });

  // Identity — a session owner OR the emailed purpose-scoped cancel token
  // (guest path; Fabrizio cms0idtz7). The token can never be a status token
  // or another order's token (see customer-cancel-auth tests).
  const ownership = await checkOrderOwnership(order.customerId, order.restaurantId);
  if (!isCancelAuthorized({ owned: !!ownership, purpose: "order-cancel", subjectId: id, token })) {
    return NextResponse.json(
      {
        error: "Sign in to cancel this order, or call the restaurant.",
        code: token ? "invalid_token" : "not_signed_in_or_not_owner",
      },
      { status: 401 },
    );
  }

  // State precondition — only PENDING orders can be customer-cancelled.
  // Once the kitchen accepts, the customer MUST call the restaurant
  // (Luigi 2026-05-30: "no cancelling after it's accepted"). Abandoned
  // pending orders are swept by the auto-reject cron, so the cancel stays
  // live for the whole pending window.
  if (order.status !== "pending") {
    return NextResponse.json(
      {
        error: order.status === "accepted"
          ? "Your order has already been accepted by the restaurant. Please call them directly to cancel."
          : `Order is ${order.status} — nothing to cancel.`,
        code: order.status === "accepted" ? "already_accepted" : "wrong_status",
      },
      { status: 409 },
    );
  }

  const now = new Date();
  // IDEMPOTENT CLAIM (auto-reject cron pattern): guard the transition on
  // status:"pending" so a kitchen Accept racing this request can never be
  // overwritten into a cancel (pre-fix, a captured order could end
  // "cancelled" with the money kept). count === 0 → someone else moved the
  // status first; re-read and answer with the right 409, NO side effects.
  const claim = await prisma.order.updateMany({
    where: { id: order.id, status: "pending" },
    data: {
      status: "cancelled",
      rejectedAt: now,
      rejectionReason: "Customer cancelled from the order status page.",
      cancelledBy: "customer",
    },
  });
  if (claim.count === 0) {
    const fresh = await prisma.order.findUnique({ where: { id }, select: { status: true } });
    const s = fresh?.status ?? "unknown";
    return NextResponse.json(
      {
        error: s === "accepted"
          ? "Your order has already been accepted by the restaurant. Please call them directly to cancel."
          : `Order is ${s} — nothing to cancel.`,
        code: s === "accepted" ? "already_accepted" : "wrong_status",
      },
      { status: 409 },
    );
  }

  // Give back everything this order had claimed — exactly like the kitchen
  // reject path (orders/[id]/route.ts) and the auto-reject cron. Without
  // these, a customer who cancelled their OWN pending order permanently lost
  // any Reward Dollars reserved on it (balance was decremented at create),
  // burned their coupon grant, and leaked a capped promo's usage slot.
  // All three are idempotent + internally try/caught. Found during the
  // Blocker #8 wallet-restore pass (2026-07-02).
  await releaseCouponsForOrder(order.id);
  await releaseRewardForOrder(order.id);
  await releasePromotionUsageForOrder(order.id);

  // Reserve-then-order: sync the linked booking so it doesn't sit "pending"
  // forever after its order died — mirrors the kitchen PATCH path.
  after(
    (async () => {
      try {
        await prisma.reservation.updateMany({
          where: { orderId: id, status: { in: ["pending", "confirmed"] } },
          data: { status: "cancelled", cancelledBy: "customer" },
        });
      } catch (e) {
        console.error(`[public cancel] linked reservation sync failed for order ${id}:`, e);
      }
    })(),
  );

  // Side effects — fire-and-forget. Cancellation should succeed even if
  // a downstream void fails (the customer already sees the order
  // cancelled; the restaurant can reconcile any stuck auth manually).
  if (
    order.paymentMethod === "card" &&
    order.paymentStatus === "authorized" &&
    order.paymentIntentId
  ) {
    const piId = order.paymentIntentId;
    const rId = order.restaurantId;
    after(
      (async () => {
        try {
          await voidPayment({ paymentIntentId: piId, restaurantId: rId });
          await prisma.order.update({ where: { id }, data: { paymentStatus: "voided" } });
        } catch (e) {
          console.error(`[public cancel] stripe void failed for order ${id}:`, e);
        }
      })(),
    );
  }
  if (
    order.paymentMethod === "paypal" &&
    order.paymentStatus === "authorized" &&
    order.paypalAuthorizationId
  ) {
    const authId = order.paypalAuthorizationId;
    after(
      (async () => {
        try {
          await voidPaypalAuthorization({
            restaurantId: order.restaurantId,
            authorizationId: authId,
            orderId: id,
          });
          await prisma.order.update({ where: { id }, data: { paymentStatus: "voided" } });
        } catch (e) {
          console.error(`[public cancel] paypal void failed for order ${id}:`, e);
        }
      })(),
    );
  }
  if (order.viaMarketplace && order.marketplaceCounterApplied) {
    after(
      (async () => {
        try {
          await unrecordMarketplaceOrder({
            orderId: id,
            restaurantId: order.restaurantId,
            orderTotalCents: Math.round(order.total * 100),
          });
        } catch (e) {
          console.error(`[public cancel] marketplace unrecord failed for order ${id}:`, e);
        }
      })(),
    );
  }
  // Smart-link counter rollback — a customer-cancelled order shouldn't keep
  // counting toward a Marketing Studio link's Orders + Revenue. Idempotent.
  if (order.smartLinkCounterApplied) {
    after(
      (async () => {
        try {
          await unrecordSmartLinkOrder({ orderId: id, orderTotalCents: Math.round(order.total * 100) });
        } catch (e) {
          console.error(`[public cancel] smart-link unrecord failed for order ${id}:`, e);
        }
      })(),
    );
  }

  // Customer confirmation email — the "cancelled" status email with the
  // customer-initiated copy variant + the per-method hold-release lines
  // (card/PayPal auth was never captured → released, not refunded).
  // Modeled on the auto-reject cron's call. Fire-and-forget.
  after(
    notifyCustomer({
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
        cancelledBy: "customer",
        paymentMethod: order.paymentMethod || undefined,
        paidOnline:
          order.paymentMethod === "card" || order.paymentMethod === "paypal"
            ? ["authorized", "paid", "refunded"].includes(order.paymentStatus ?? "")
            : false,
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
    }).catch((e: unknown) => console.error("[public cancel notifyCustomer]", e)),
  );

  // Staff ping — ONLY when the order actually reached the kitchen (notifiedAt
  // set). An unpaid online order cancelled/abandoned BEFORE payment never hit
  // the board, so a "cancelled" notification for it is pure noise — the store
  // never received the order (Luigi 2026-08-05: "it doesn't make sense to get a
  // cancellation email when we didn't get an order"). Customer still gets their
  // own cancellation confirmation above.
  if (order.notifiedAt) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
    after(
      notifyStaff({
        restaurantId: order.restaurant.id,
        payload: {
          event: "orderCanceled",
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          dashboardUrl: `${baseUrl}/admin/orders`,
          orderTotal: order.total,
          ...(orderShowsCredit(order.restaurant as any, order)
            ? { creditApplied: order.creditApplied, rewardLabel: resolveRewardLabel(order.restaurant as any, "") }
            : {}),
        },
      }).catch((e: unknown) => console.error("[public cancel notifyStaff]", e)),
    );
  }

  return NextResponse.json({ ok: true });
}
