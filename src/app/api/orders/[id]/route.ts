import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { notifyStaff, notifyCustomer, staffAcceptEventForOrderType } from "@/lib/notifications";
import { refundDestinationPayment, stripeReady } from "@/lib/stripe";

const ALLOWED_STATUSES = ["pending", "accepted", "preparing", "ready", "completed", "rejected", "cancelled"] as const;

const PUBLIC_ORDER_SELECT = {
  id: true, orderNumber: true, status: true, type: true,
  customerName: true, notes: true, subtotal: true, taxAmount: true,
  deliveryFee: true, tip: true, total: true, paymentMethod: true,
  paymentStatus: true, scheduledFor: true, estimatedReady: true,
  acceptedAt: true, rejectedAt: true, rejectionReason: true,
  completedAt: true, preparationTime: true, createdAt: true,
  refundStatus: true,
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
    select: { restaurantId: true, status: true, paymentStatus: true, paymentIntentId: true },
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

  const updates: Record<string, unknown> = { status: newStatus };

  if (newStatus === "accepted") {
    updates.acceptedAt = new Date();
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

  // Attempt Stripe refund if payment was captured and the order is being
  // killed by the restaurant. Both "cancelled" (post-accept) and "rejected"
  // (pre-accept) need to issue the customer's money back — the customer
  // never receives the food, so we must never keep the money. The refund
  // is fire-and-forget; the webhook flips paymentStatus to "refunded" once
  // Stripe confirms.
  const isKilled = newStatus === "cancelled" || newStatus === "rejected";
  if (isKilled && existing.paymentStatus === "paid" && existing.paymentIntentId) {
    refundOrderAsync(id, existing.paymentIntentId).catch(() => {});
  }

  // ── Notifications ──────────────────────────────────────────────────────
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  // Always tell the customer about status changes (toggle is per-status inside notifyCustomer).
  notifyCustomer({
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
  }).catch((e) => console.error("[notifyCustomer orderStatusUpdate]", e));

  // Fan-out to staff recipients based on the new status. Each transition maps
  // to a specific toggle so a restaurant can mute, e.g., dine-in confirmations
  // without losing delivery ones.
  if (newStatus === "accepted") {
    const acceptEvent = staffAcceptEventForOrderType(order.type, !!order.scheduledFor);
    notifyStaff({
      restaurantId: order.restaurant.id,
      payload: {
        event: acceptEvent,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        total: order.total,
        dashboardUrl: `${baseUrl}/admin/orders`,
      },
    }).catch((e) => console.error("[notifyStaff order accepted]", e));
  } else if (newStatus === "rejected") {
    notifyStaff({
      restaurantId: order.restaurant.id,
      payload: {
        event: "orderRejected",
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        reason: order.rejectionReason || undefined,
        dashboardUrl: `${baseUrl}/admin/orders`,
      },
    }).catch((e) => console.error("[notifyStaff orderRejected]", e));
  } else if (newStatus === "cancelled") {
    notifyStaff({
      restaurantId: order.restaurant.id,
      payload: {
        event: "orderCanceled",
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        dashboardUrl: `${baseUrl}/admin/orders`,
      },
    }).catch((e) => console.error("[notifyStaff orderCanceled]", e));
  }

  return NextResponse.json(order);
}

async function refundOrderAsync(orderId: string, paymentIntentId: string) {
  try {
    await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "pending" } });

    if (!(await stripeReady())) {
      await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } });
      return;
    }

    // Destination charge refund — also reverses the transfer to the connected
    // account and refunds the platform application fee so the restaurant
    // doesn't eat the fee on a cancelled order.
    await refundDestinationPayment({
      paymentIntentId,
      refundApplicationFee: true,
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
    await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } }).catch(() => {});
  }
}
