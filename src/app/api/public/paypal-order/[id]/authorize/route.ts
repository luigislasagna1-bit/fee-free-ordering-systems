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
import { authorizePaypalOrder, getPaypalAuthorizationStatus, capturePaypalAuthorization } from "@/lib/paypal";
import { isPaypalAlreadyCaptured } from "@/lib/capture-idempotency";
import { fireOrderNotifications } from "@/lib/order-notifications";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true, restaurantId: true, paymentMethod: true, paymentStatus: true, status: true,
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
  // Already settled (captured→paid, refunded, or voided) → nothing to do. Also
  // guards the re-call after the auto-accept capture below flips us to "paid":
  // without this, a customer refresh would fall through and try to re-authorize
  // an order whose funds were already captured.
  if (order.paymentStatus === "paid" || order.paymentStatus === "refunded" || order.paymentStatus === "voided") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // Already authorized → potentially idempotent success path. Customer
  // hit refresh or the webhook landed first.
  //
  // Audit 2026-05-30 #75: previously this just returned success without
  // verifying the auth is still valid at PayPal. PayPal auths expire
  // after 24h, so a stale record would silently claim success here and
  // then fail at capture time when the kitchen accepts. Now we check
  // the live status; only CREATED is treated as "still capturable."
  // Anything else clears the stale ID so the re-auth path below runs.
  if (order.paypalAuthorizationId && order.paymentStatus === "authorized") {
    try {
      const live = await getPaypalAuthorizationStatus({
        restaurantId: order.restaurantId,
        authorizationId: order.paypalAuthorizationId,
      });
      if (live.status === "CREATED") {
        return NextResponse.json({ ok: true, idempotent: true });
      }
      // Stale — clear our record and fall through to fresh authorize.
      // Don't change paymentStatus here; if the auth was captured it
      // already became "paid" via webhook; if voided it'd be "voided".
      console.warn(
        `[paypal authorize] order ${order.id} had stored auth ${order.paypalAuthorizationId} with status ${live.status}; re-authorizing.`,
      );
      await prisma.order.update({
        where: { id: order.id },
        data: { paypalAuthorizationId: null },
      });
    } catch (statusErr) {
      // PayPal lookup failed (network blip, key rotation). Don't
      // assume worst case — return the idempotent success we'd have
      // returned without the check. The capture path will catch
      // genuine expiry with a clearer error.
      console.warn(
        `[paypal authorize] could not verify stored auth status for order ${order.id}; treating as idempotent.`,
        statusErr instanceof Error ? statusErr.message : statusErr,
      );
      return NextResponse.json({ ok: true, idempotent: true });
    }
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

    // AUTO-ACCEPT capture-on-authorize (Luigi 2026-07-06, stabilization C3): an
    // auto-accepted order (status="accepted") never reaches the kitchen Accept
    // path where PayPal capture normally happens, so the authorization would
    // expire uncaptured and the restaurant would never be paid. Capture now so
    // the payment is collected immediately. PayPal capture is idempotent
    // (PayPal-Request-Id = capture:<orderId>), so a replay/retry is safe; a
    // capture FAILURE must NOT block releasing the order to the kitchen — leave
    // it "authorized" for a manual re-accept / reconcile.
    if (order.status === "accepted") {
      try {
        const cap = await capturePaypalAuthorization({
          restaurantId: order.restaurantId,
          authorizationId: result.authorizationId,
          orderId: order.id,
        });
        await prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "paid", paypalCaptureId: cap.captureId },
        });
      } catch (capErr) {
        if (isPaypalAlreadyCaptured(capErr)) {
          await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "paid" } });
        } else {
          console.error(
            `[paypal authorize] auto-accept capture failed for order ${order.id} — left authorized for retry:`,
            capErr instanceof Error ? capErr.message : String(capErr),
          );
        }
      }
    }

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
