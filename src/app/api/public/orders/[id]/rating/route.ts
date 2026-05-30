/**
 * POST /api/public/orders/[id]/rating
 *
 * Submit a customer rating for a COMPLETED order. Body:
 *   { score: 1 | -1, comment?: string }
 *
 * Idempotent on the (orderId, customerId) pair via upsert — the
 * customer can re-tap to flip 👍 ↔ 👎 within the same session.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { getCurrentCustomer } from "@/lib/customer-session";

/** Marketplace-aware ownership check — see cancel route for rationale. */
async function checkOrderOwnership(orderCustomerId: string | null, expectedRestaurantId: string) {
  const me = await getCurrentRestaurantCustomer({ expectedRestaurantId });
  if (me && orderCustomerId === me.id) return true;
  const acct = await getCurrentCustomer();
  if (acct && orderCustomerId) {
    const linked = await prisma.customer.findUnique({
      where: { id: orderCustomerId },
      select: { customerAccountId: true },
    });
    if (linked && linked.customerAccountId === acct.id) return true;
  }
  return false;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Order id required" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const score = body?.score === 1 ? 1 : body?.score === -1 ? -1 : null;
  if (score === null) {
    return NextResponse.json({ error: "score must be 1 or -1" }, { status: 400 });
  }
  const comment = typeof body?.comment === "string"
    ? body.comment.trim().slice(0, 500) || null
    : null;

  const order = await prisma.order.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, status: true, customerId: true },
  });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.status !== "completed") {
    return NextResponse.json(
      { error: "Only completed orders can be rated.", code: "wrong_status" },
      { status: 409 },
    );
  }

  // Verify the customer is the one who placed the order — accepts
  // either a per-restaurant Customer session OR a marketplace
  // CustomerAccount session linked to the order's Customer row.
  // Without a session we can't establish identity for rating writes —
  // guests would need a signed token in the email link (future work).
  const owns = await checkOrderOwnership(order.customerId, order.restaurantId);
  if (!owns) {
    return NextResponse.json({ error: "Sign in to rate this order." }, { status: 401 });
  }

  const rating = await prisma.orderRating.upsert({
    where: { orderId: order.id },
    create: { orderId: order.id, restaurantId: order.restaurantId, score, comment },
    update: { score, comment },
    select: { score: true, comment: true, createdAt: true },
  });
  return NextResponse.json({ rating });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rating = await prisma.orderRating.findUnique({
    where: { orderId: id },
    select: { score: true, comment: true, createdAt: true },
  });
  return NextResponse.json({ rating });
}
