import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { hasFeature } from "@/lib/entitlements";

/**
 * Customer push-token registration for the Branded Mobile App
 * (Luigi 2026-08-02).
 *
 * POST   { token, platform? }  — register/refresh this device's FCM token.
 * DELETE { token }             — logout-style unregister of ONE device.
 *
 * Auth: the per-restaurant customer session (ff_rest_account), tenant-checked
 * via expectedRestaurantId — a session for restaurant A can never register
 * against restaurant B (401). Entitlement-gated: push is part of the
 * branded_mobile_app add-on; a 403 tells the shell to hide push UI.
 *
 * MULTI-DEVICE BY DESIGN: upsert by token only. The kitchen route's
 * single-active-device deleteMany is a staff-workflow policy — copying it
 * here would silently unsubscribe the customer's other devices.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const customer = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (!customer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!(await hasFeature(restaurant.id, "app_store_listing"))) {
    return NextResponse.json({ error: "push_not_available" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 4096) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  const platform = ["android", "ios", "web"].includes(body.platform) ? body.platform : "android";

  // Cap devices per customer — nothing else bounds this endpoint (any
  // distinct token string passes validation), so a scripted caller could
  // otherwise register unlimited junk tokens, each one costing a doomed FCM
  // call on every future order-status push. Real multi-device use (phone +
  // tablet + old phone) never approaches this; evict the LEAST-recently-seen
  // device to make room, same idea as a session cap.
  const MAX_DEVICES_PER_CUSTOMER = 10;
  const existing = await prisma.customerPushToken.findUnique({ where: { token }, select: { id: true } });
  if (!existing) {
    const count = await prisma.customerPushToken.count({ where: { customerId: customer.id } });
    if (count >= MAX_DEVICES_PER_CUSTOMER) {
      const toEvict = await prisma.customerPushToken.findMany({
        where: { customerId: customer.id },
        orderBy: { lastSeenAt: "asc" },
        take: count - MAX_DEVICES_PER_CUSTOMER + 1,
        select: { id: true },
      });
      await prisma.customerPushToken.deleteMany({ where: { id: { in: toEvict.map((d) => d.id) } } });
    }
  }

  // Upsert by token: a re-register refreshes lastSeenAt; a token that moved
  // to a different signed-in customer follows the CURRENT session.
  await prisma.customerPushToken.upsert({
    where: { token },
    update: { customerId: customer.id, restaurantId: restaurant.id, platform, lastSeenAt: new Date() },
    create: { token, customerId: customer.id, restaurantId: restaurant.id, platform },
  });
  // Ensure a pref row exists so the account page always has one to render.
  await prisma.customerPushPref.upsert({
    where: { customerId: customer.id },
    update: {},
    create: { customerId: customer.id },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const customer = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (!customer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ error: "bad_token" }, { status: 400 });

  // Only the owning customer may unregister a token — deleteMany with BOTH
  // conditions is the object-level authorization.
  await prisma.customerPushToken.deleteMany({ where: { token, customerId: customer.id } });
  return NextResponse.json({ ok: true });
}
