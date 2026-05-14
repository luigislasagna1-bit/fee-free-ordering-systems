import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { sendOrderStatusUpdateEmail } from "@/lib/email";
import { decrypt } from "@/lib/encrypt";

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
    include: { restaurant: { select: { name: true } } },
  });

  // Attempt Stripe refund if payment was captured and order is cancelled
  if (newStatus === "cancelled" && existing.paymentStatus === "paid" && existing.paymentIntentId) {
    refundOrderAsync(user.restaurantId, id, existing.paymentIntentId).catch(() => {});
  }

  if (order.customerEmail) {
    sendOrderStatusUpdateEmail({
      to: order.customerEmail,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      status: order.status,
      restaurantName: order.restaurant.name,
      estimatedReady: order.estimatedReady ? new Date(order.estimatedReady) : undefined,
      rejectionReason: order.rejectionReason || undefined,
    }).catch(() => {});
  }

  return NextResponse.json(order);
}

async function refundOrderAsync(restaurantId: string, orderId: string, paymentIntentId: string) {
  try {
    await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "pending" } });

    const pp = await prisma.paymentProvider.findUnique({ where: { restaurantId } });
    if (!pp?.secretKeyEnc || !pp.secretKeyIv || !pp.secretKeyTag || !process.env.ENCRYPTION_KEY) {
      await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } });
      return;
    }

    const secretKey = decrypt(pp.secretKeyEnc, pp.secretKeyIv, pp.secretKeyTag);
    const res = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `payment_intent=${paymentIntentId}`,
    });

    if (res.ok) {
      await prisma.order.update({
        where: { id: orderId },
        data: { refundStatus: "refunded", paymentStatus: "refunded" },
      });
    } else {
      await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } });
    }
  } catch {
    await prisma.order.update({ where: { id: orderId }, data: { refundStatus: "failed" } }).catch(() => {});
  }
}
