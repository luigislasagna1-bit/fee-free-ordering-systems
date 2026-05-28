/**
 * POST /api/public/paypal-order/[id]/authorize
 *
 * Called by the customer after they approve on PayPal and bounce back to
 * our return URL. We authorize the PayPal order — locks funds without
 * charging. Saves the authorizationId to our Order row and flips
 * paymentStatus → "authorized" + notifiedAt (releases to kitchen, same
 * as Stripe's payment_intent.amount_capturable_updated webhook).
 *
 * Note: PayPal does send webhooks for this too (PAYMENT.AUTHORIZATION.CREATED),
 * but the customer-flow path uses this explicit call because we want the
 * authorize step to happen synchronously while we still have the customer
 * on the page — they need to see "Order placed!" before being redirected
 * to their tracking page. The webhook path is the safety net for the
 * (rare) case where the customer closes the tab between approve and return.
 *
 * [id] is OUR order id, not PayPal's.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { authorizePaypalOrder } from "@/lib/paypal";
import { fireOrderNotifications } from "@/lib/order-notifications";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true, restaurantId: true, paymentMethod: true, paymentStatus: true,
      paypalOrderId: true, paypalAuthorizationId: true,
    },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.paymentMethod !== "paypal") {
    return NextResponse.json({ error: "Order is not paying with PayPal" }, { status: 400 });
  }
  if (!order.paypalOrderId) {
    return NextResponse.json({ error: "PayPal order not created yet" }, { status: 400 });
  }

  // Already authorized → idempotent success path. Customer hit refresh
  // or the webhook landed first. Don't re-authorize (PayPal would
  // 422); just acknowledge.
  if (order.paypalAuthorizationId && order.paymentStatus === "authorized") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  try {
    const result = await authorizePaypalOrder({
      restaurantId: order.restaurantId,
      paypalOrderId: order.paypalOrderId,
      orderId: order.id,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: {
        paypalAuthorizationId: result.authorizationId,
        paymentStatus: "authorized",
      },
    });

    // Release the order to the kitchen + send customer "Order received"
    // email. fireOrderNotifications is idempotent on notifiedAt, so a
    // duplicate call (e.g. webhook racing this) is a no-op.
    await fireOrderNotifications(order.id);

    return NextResponse.json({ ok: true, authorizationId: result.authorizationId });
  } catch (err: unknown) {
    console.error("[paypal-order authorize]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not authorize the PayPal payment. Please try again." },
      { status: 502 },
    );
  }
}
