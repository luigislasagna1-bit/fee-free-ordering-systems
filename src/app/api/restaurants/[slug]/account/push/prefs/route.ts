import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";

/**
 * Customer push preferences (Luigi 2026-08-02).
 * GET → current prefs; PATCH { orderUpdates?, marketing? } → update.
 * Marketing pushes ADDITIONALLY require Customer.marketingConsent at send
 * time (double-gate, same as marketing email) — this pref alone never
 * authorizes a marketing send.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const customer = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (!customer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const pref = await prisma.customerPushPref.findUnique({ where: { customerId: customer.id } });
  const devices = await prisma.customerPushToken.count({ where: { customerId: customer.id } });
  return NextResponse.json({
    prefs: { orderUpdates: pref?.orderUpdates ?? true, marketing: pref?.marketing ?? false },
    devices,
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
  if (!restaurant) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const customer = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (!customer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: { orderUpdates?: boolean; marketing?: boolean } = {};
  if ("orderUpdates" in body) data.orderUpdates = body.orderUpdates === true;
  if ("marketing" in body) data.marketing = body.marketing === true;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

  const pref = await prisma.customerPushPref.upsert({
    where: { customerId: customer.id },
    update: data,
    create: { customerId: customer.id, ...data },
  });
  return NextResponse.json({ prefs: { orderUpdates: pref.orderUpdates, marketing: pref.marketing } });
}
