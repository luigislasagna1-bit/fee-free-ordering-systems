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
import { voidPayment, stripeReady } from "@/lib/stripe";
import { voidPaypalAuthorization } from "@/lib/paypal";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";

/** Maximum age of an order (from createdAt) for the customer to cancel
 *  themselves. After this window they must call the restaurant. Keeps
 *  the cancel flow safe from accidental clicks on hours-old pending
 *  orders the kitchen has been working on. */
const CANCEL_WINDOW_MINUTES = 10;

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
      viaMarketplace: true, marketplaceCounterApplied: true, total: true,
      restaurant: { select: { stripeAccountId: true } },
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const me = await getCurrentRestaurantCustomer({ expectedRestaurantId: order.restaurantId });
  if (!me) {
    return NextResponse.json(
      { error: "Sign in to cancel this order, or call the restaurant.", code: "not_signed_in" },
      { status: 401 },
    );
  }
  if (order.customerId !== me.id) {
    return NextResponse.json({ error: "This is not your order." }, { status: 403 });
  }

  // State preconditions.
  if (order.status !== "pending") {
    return NextResponse.json(
      {
        error: order.status === "accepted"
          ? "Your order has already been accepted. Please call the restaurant to cancel."
          : `Order is ${order.status} — nothing to cancel.`,
        code: "wrong_status",
      },
      { status: 409 },
    );
  }
  const ageMin = (Date.now() - new Date(order.createdAt).getTime()) / 60_000;
  if (ageMin > CANCEL_WINDOW_MINUTES) {
    return NextResponse.json(
      {
        error: `Self-cancel is only available within ${CANCEL_WINDOW_MINUTES} minutes of placing the order. Please call the restaurant.`,
        code: "window_expired",
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

  // Side effects — fire-and-forget. Cancellation should succeed even if
  // a downstream void fails (the customer already sees the order
  // cancelled; the restaurant can reconcile any stuck auth manually).
  if (
    order.paymentMethod === "card" &&
    order.paymentStatus === "authorized" &&
    order.paymentIntentId &&
    order.restaurant.stripeAccountId
  ) {
    const piId = order.paymentIntentId;
    const acctId = order.restaurant.stripeAccountId;
    after(
      (async () => {
        try {
          if (await stripeReady()) {
            await voidPayment({ paymentIntentId: piId, restaurantStripeAccountId: acctId });
            await prisma.order.update({ where: { id }, data: { paymentStatus: "voided" } });
          }
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

  return NextResponse.json({ ok: true });
}
