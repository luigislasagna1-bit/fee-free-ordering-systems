/**
 * POST /api/public/orders/[id]/cancel
 *
 * Customer-initiated cancellation. Only allowed when:
 *   • The customer has a per-restaurant Customer session and the
 *     order's customerId matches it (i.e. they actually own the order).
 *   • The order is still in "pending" status (kitchen hasn't accepted).
 *   • The order is younger than CANCEL_WINDOW_MINUTES — we don't want
 *     a customer cancelling an order the kitchen has already started
 *     prepping just because the kitchen forgot to hit Accept.
 *
 * On success:
 *   • Order.status = "cancelled", rejectedAt = now, rejectionReason = "Customer cancelled"
 *   • Stripe pre-capture authorization is voided (refundDirectPayment for
 *     captured cards is NOT called — the customer can't cancel after the
 *     kitchen accepts, so capture should never have fired).
 *   • PayPal authorization voided similarly.
 *   • Marketplace counter rolled back.
 *
 * This is the new GloriaFood-style customer cancel; Toast / Uber /
 * DoorDash / Skip / Grubhub all expose this. Previously customers
 * had to phone the restaurant.
 */

import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { getCurrentCustomer } from "@/lib/customer-session";
import { voidPayment } from "@/lib/stripe";
import { voidPaypalAuthorization } from "@/lib/paypal";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";
import { unrecordSmartLinkOrder } from "@/lib/marketing-studio";
import { releaseCouponsForOrder } from "@/lib/coupon-ledger";
import { releaseForOrder as releaseRewardForOrder } from "@/lib/reward-ledger";
import { releasePromotionUsageForOrder } from "@/lib/promo-usage";

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

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  // Identity — the customer must be signed in via the per-restaurant
  // session and the order must belong to that customer. (Guests can't
  // self-cancel; that's a deliberate v1 scope choice — the security
  // story for a guest cancel needs a signed token in the confirmation
  // URL, which is future work.)
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true, orderNumber: true, status: true, customerId: true,
      restaurantId: true, createdAt: true,
      paymentMethod: true, paymentStatus: true, paymentIntentId: true,
      paypalAuthorizationId: true,
      viaMarketplace: true, marketplaceCounterApplied: true, smartLinkCounterApplied: true, total: true,
      restaurant: { select: { stripeAccountId: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const ownership = await checkOrderOwnership(order.customerId, order.restaurantId);
  if (!ownership) {
    return NextResponse.json(
      { error: "Sign in to cancel this order, or call the restaurant.", code: "not_signed_in_or_not_owner" },
      { status: 401 },
    );
  }

  // State precondition — only PENDING orders can be customer-cancelled.
  // Once the kitchen accepts, the customer MUST call the restaurant
  // (Luigi 2026-05-30: "no cancelling after it's accepted"). The
  // 10-minute time window the original v1 had is gone — abandoned-
  // pending orders are swept by the auto-reject cron after 30 min,
  // so leaving the cancel button live the whole pending window is
  // safe + gives the customer the maximum control.
  if (order.status !== "pending") {
    return NextResponse.json(
      {
        error: order.status === "accepted"
          ? "Your order has already been accepted by the restaurant. Please call them directly to cancel."
          : `Order is ${order.status} — nothing to cancel.`,
        code: "wrong_status",
      },
      { status: 409 },
    );
  }

  const now = new Date();
  // Update status FIRST so a webhook race doesn't reverse our work.
  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "cancelled",
      rejectedAt: now,
      rejectionReason: "Customer cancelled from the order status page.",
    },
  });

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

  return NextResponse.json({ ok: true });
}
