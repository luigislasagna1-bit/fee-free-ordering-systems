import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { notifyStaff, notifyCustomer, staffAcceptEventForOrderType } from "@/lib/notifications";
import {
  capturePayment,
  refundDirectPayment,
  stripeReady,
  voidPayment,
} from "@/lib/stripe";
import { unrecordMarketplaceOrder } from "@/lib/marketplace";

const ALLOWED_STATUSES = ["pending", "accepted", "preparing", "ready", "completed", "rejected", "cancelled"] as const;

const PUBLIC_ORDER_SELECT = {
  id: true, orderNumber: true, status: true, type: true,
  customerName: true, notes: true, subtotal: true, taxAmount: true,
  deliveryFee: true, tip: true, total: true, paymentMethod: true,
  paymentStatus: true, scheduledFor: true, estimatedReady: true,
  acceptedAt: true, rejectedAt: true, rejectionReason: true,
  completedAt: true, preparationTime: true, createdAt: true,
  refundStatus: true,
  // Marketplace attribution — used by the status page so the "← Back"
  // link sends customers back to the marketplace grid (where they came
  // from) instead of the standalone restaurant menu.
  viaMarketplace: true,
  restaurant: {
    select: { name: true, slug: true, phone: true, estimatedPickup: true, estimatedDelivery: true },
  },
  items: {
    select: {
      id: true, name: true, price: true, quantity: true, subtotal: true,
      notes: true, variantName: true,
      modifiers: { select: { name: true, priceAdjustment: true } },
    },
  },
} as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();

  if (user?.restaurantId) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        restaurant: { select: { name: true, slug: true, phone: true, estimatedPickup: true, estimatedDelivery: true } },
        items: { include: { modifiers: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.restaurantId !== user.restaurantId && user.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(order);
  }

  const order = await prisma.order.findUnique({ where: { id }, select: PUBLIC_ORDER_SELECT });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      restaurantId: true,
      status: true,
      paymentStatus: true,
      paymentIntentId: true,
      paymentMethod: true,
      viaMarketplace: true,
      marketplaceCounterApplied: true,
      total: true,
      restaurant: { select: { stripeAccountId: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (existing.restaurantId !== user.restaurantId && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data = await req.json();
  const newStatus = data.status as string;

  if (!ALLOWED_STATUSES.includes(newStatus as typeof ALLOWED_STATUSES[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // ── Capture-on-accept ────────────────────────────────────────────────────
  // Under the authorize-then-capture model, the customer's card has only
  // been AUTHORIZED at this point — no money has moved yet. When the
  // kitchen clicks "Accept" we must actually capture the funds before
  // committing the state transition. If capture fails (card declined at
  // capture, authorization expired) we BLOCK the acceptance so the
  // restaurant doesn't start cooking food they'll never get paid for.
  if (
    newStatus === "accepted" &&
    existing.paymentMethod === "card" &&
    existing.paymentStatus === "authorized" &&
    existing.paymentIntentId &&
    existing.restaurant.stripeAccountId
  ) {
    if (!(await stripeReady())) {
      return NextResponse.json(
        { error: "Online payments are not configured. Cannot capture authorization." },
        { status: 503 },
      );
    }
    try {
      await capturePayment({
        paymentIntentId: existing.paymentIntentId,
        restaurantStripeAccountId: existing.restaurant.stripeAccountId,
      });
      // Stripe will fire payment_intent.succeeded → webhook sets
      // paymentStatus="paid". To avoid a brief window where the kitchen
      // shows "accepted" but paymentStatus still says "authorized" (which
      // some UI / cron paths key off), flip it ourselves now too. The
      // webhook update is idempotent.
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[orders PATCH] capturePayment failed for order ${id}:`, msg);
      return NextResponse.json(
        {
          error:
            "Couldn't charge the customer's card. The card may have been declined or the authorization expired. Reject this order to release the hold.",
          code: "capture_failed",
          detail: msg,
        },
        { status: 402 },
      );
    }
  }

  const updates: Record<string, unknown> = { status: newStatus };

  if (newStatus === "accepted") {
    updates.acceptedAt = new Date();
    // Flip paymentStatus → "paid" inline if we just captured (above) or
    // if this is a non-card order. The webhook will land independently
    // and re-set the same value (idempotent).
    if (existing.paymentMethod === "card" && existing.paymentStatus === "authorized") {
      updates.paymentStatus = "paid";
    }
    const prepTime = parseInt(data.preparationTime, 10);
    if (!isNaN(prepTime) && prepTime > 0 && prepTime <= 240) {
      updates.preparationTime = prepTime;
      updates.estimatedReady = new Date(Date.now() + prepTime * 60 * 1000);
    }
  }
  if (newStatus === "rejected") {
    updates.rejectedAt = new Date();
    updates.rejectionReason = String(data.rejectionReason ?? "").slice(0, 500) || null;
  }
  if (newStatus === "completed") {
    updates.completedAt = new Date();
  }
  if (newStatus === "cancelled") {
    updates.rejectedAt = new Date();
    updates.rejectionReason = String(data.rejectionReason ?? "Cancelled by restaurant").slice(0, 500);
  }

  const order = await prisma.order.update({
    where: { id },
    data: updates,
    include: { restaurant: { select: { id: true, name: true, defaultLanguage: true } } },
  });

  // ── Kill flow: void vs refund ────────────────────────────────────────────
  // When the restaurant rejects/cancels an order, what happens depends on
  // whether the card was already captured:
  //
  //   - paymentStatus = "authorized"  → just a hold, no money moved yet.
  //       Call voidPayment to release the authorization. Customer never
  //       sees a charge. No Stripe fee, no refund mechanics. This is the
  //       common path because most rejections happen BEFORE the kitchen
  //       accepts (i.e. before we capture).
  //
  //   - paymentStatus = "paid"  → money already moved. Need a real refund.
  //       This is rare (post-accept cancellation) but still has to work.
  //
  //   - paymentStatus = "voided" / "refunded" → already in a terminal state,
  //       nothing more to do.
  const isKilled = newStatus === "cancelled" || newStatus === "rejected";
  const accountId = existing.restaurant.stripeAccountId;
  if (isKilled && existing.paymentIntentId && accountId) {
    const piId = existing.paymentIntentId;
    if (existing.paymentStatus === "authorized") {
      // Void the authorization — no charge, no fee, no refund.
      after(
        (async () => {
          try {
            await voidPayment({
              paymentIntentId: piId,
              restaurantStripeAccountId: accountId,
            });
            // Webhook (payment_intent.canceled) will flip paymentStatus
            // to "voided"; flip it here too so the admin UI updates
            // immediately. Idempotent.
            await prisma.order.update({
              where: { id },
              data: { paymentStatus: "voided" },
            });
          } catch (e) {
            console.error("[orders PATCH] voidPayment:", e);
            // Best-effort: if the void call fails (e.g. authorization
            // already expired and was auto-released by Stripe), the
            // customer is still fine — there was never a charge.
          }
        })(),
      );
    } else if (existing.paymentStatus === "paid") {
      // Real refund — post-capture cancellation. Rare path.
      after(
        (async () => {
          try {
            await refundCapturedOrder(id, piId, accountId);
          } catch (e) {
            console.error("[orders PATCH] refundCapturedOrder:", e);
          }
        })(),
      );
    }
  }

  // Marketplace counter rollback. If this was a marketplace-attributed
  // order whose counter increment landed at create time, peel it back
  // out of the listing's monthly totals so we don't bill the restaurant
  // for an order they never fulfilled. unrecord is idempotent — repeat
  // status flips between cancelled/rejected won't double-decrement.
  if (isKilled && existing.viaMarketplace && existing.marketplaceCounterApplied) {
    const totalCents = Math.round(existing.total * 100);
    const restaurantIdForRollback = existing.restaurantId;
    after(
      (async () => {
        try {
          await unrecordMarketplaceOrder({
            orderId: id,
            restaurantId: restaurantIdForRollback,
            orderTotalCents: totalCents,
          });
        } catch (e) {
          console.error("[orders PATCH] unrecordMarketplaceOrder:", e);
        }
      })(),
    );
  }

  // ── Notifications ──────────────────────────────────────────────────────
  // All scheduled via after() so the admin's PATCH responds immediately
  // (kitchen UI doesn't wait on Resend/SMS latency) while still
  // guaranteeing the side effect actually runs to completion.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  // Always tell the customer about status changes (toggle is per-status inside notifyCustomer).
  after(
    (async () => {
      try {
        await notifyCustomer({
          restaurantId: order.restaurant.id,
          customerEmail: order.customerEmail,
          orderType: order.type,
          customerLocale: order.restaurant.defaultLanguage || "en",
          payload: {
            event: "orderStatusUpdate",
            customerName: order.customerName,
            orderNumber: order.orderNumber,
            status: order.status,
            estimatedReady: order.estimatedReady ? new Date(order.estimatedReady) : undefined,
            rejectionReason: order.rejectionReason || undefined,
          },
        });
      } catch (e) {
        console.error("[notifyCustomer orderStatusUpdate]", e);
      }
    })(),
  );

  // Fan-out to staff recipients based on the new status. Each transition maps
  // to a specific toggle so a restaurant can mute, e.g., dine-in confirmations
  // without losing delivery ones.
  if (newStatus === "accepted") {
    const acceptEvent = staffAcceptEventForOrderType(order.type, !!order.scheduledFor);
    after(
      (async () => {
        try {
          await notifyStaff({
            restaurantId: order.restaurant.id,
            payload: {
              event: acceptEvent,
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              total: order.total,
              dashboardUrl: `${baseUrl}/admin/orders`,
            },
          });
        } catch (e) {
          console.error("[notifyStaff order accepted]", e);
        }
      })(),
    );
  } else if (newStatus === "rejected") {
    after(
      (async () => {
        try {
          await notifyStaff({
            restaurantId: order.restaurant.id,
            payload: {
              event: "orderRejected",
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              reason: order.rejectionReason || undefined,
              dashboardUrl: `${baseUrl}/admin/orders`,
            },
          });
        } catch (e) {
          console.error("[notifyStaff orderRejected]", e);
        }
      })(),
    );
  } else if (newStatus === "cancelled") {
    after(
      (async () => {
        try {
          await notifyStaff({
            restaurantId: order.restaurant.id,
            payload: {
              event: "orderCanceled",
              orderNumber: order.orderNumber,
              customerName: order.customerName,
              dashboardUrl: `${baseUrl}/admin/orders`,
            },
          });
        } catch (e) {
          console.error("[notifyStaff orderCanceled]", e);
        }
      })(),
    );
  }

  return NextResponse.json(order);
}

/**
 * Refund a CAPTURED order. Called from the after() block when an order
 * is killed AFTER the kitchen has already accepted (i.e. the
 * authorize-then-capture flow has already captured). Rare path — most
 * rejections happen before accept and go through voidPayment instead.
 *
 * Direct-charge refunds are simple: no transfer to reverse, no
 * application fee to refund. The money is sitting in the restaurant's
 * Stripe balance, the refund pulls it back out to the customer's card.
 * Can still fail if the restaurant's available balance is insufficient,
 * but that's their problem to resolve with Stripe — the platform isn't
 * involved in the money flow.
 */
async function refundCapturedOrder(
  orderId: string,
  paymentIntentId: string,
  restaurantStripeAccountId: string,
) {
  try {
    await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "pending" } });

    if (!(await stripeReady())) {
      await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } });
      return;
    }

    await refundDirectPayment({
      paymentIntentId,
      restaurantStripeAccountId,
      reason: "requested_by_customer",
    });

    // The actual paymentStatus → "refunded" transition is driven by the
    // charge.refunded webhook for idempotency; we mark refundStatus optimistically
    // here so the admin UI reflects the in-flight state immediately.
    await prisma.order.update({
      where: { id: orderId },
      data: { refundStatus: "refunded", paymentStatus: "refunded" },
    });
  } catch (err) {
    console.error("[refund]", err instanceof Error ? err.message : err);
    try {
      await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } });
    } catch (e) {
      // Last-resort: refund AND the refundStatus="failed" write both failed.
      // Log with the orderId so we can fix it up by hand if needed.
      console.error(`[refund] failed to mark order ${orderId} refundStatus=failed`, e);
    }
  }
}
