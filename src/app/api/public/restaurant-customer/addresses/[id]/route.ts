/**
 * PATCH  /api/public/restaurant-customer/addresses/[id]  { …partial update }
 * DELETE /api/public/restaurant-customer/addresses/[id]
 *
 * Set-default is just PATCH { isDefault: true } — the route clears the
 * prior default on the same customer to maintain the at-most-one
 * invariant.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";

async function ownedAddress(id: string, customerId: string) {
  return prisma.restaurantCustomerAddress.findFirst({ where: { id, customerId } });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentRestaurantCustomer();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await ownedAddress(id, me.id);
  if (!existing) return NextResponse.json({ error: "Address not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.label !== undefined) data.label = body.label ? String(body.label).slice(0, 30) : null;
  if (body.street !== undefined) data.street = String(body.street).trim().slice(0, 200);
  if (body.city !== undefined) data.city = String(body.city).trim().slice(0, 100);
  if (body.state !== undefined) data.state = body.state ? String(body.state).slice(0, 30) : null;
  if (body.zip !== undefined) data.zip = body.zip ? String(body.zip).slice(0, 20) : null;
  if (body.country !== undefined) data.country = String(body.country).slice(0, 10) || "CA";

  if (body.isDefault === true && !existing.isDefault) {
    await prisma.restaurantCustomerAddress.updateMany({
      where: { customerId: me.id, isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
    data.isDefault = true;
  }
  const updated = await prisma.restaurantCustomerAddress.update({ where: { id }, data });
  return NextResponse.json({ address: updated });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getCurrentRestaurantCustomer();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await ownedAddress(id, me.id);
  if (!existing) return NextResponse.json({ error: "Address not found" }, { status: 404 });
  await prisma.restaurantCustomerAddress.delete({ where: { id } });
  // If we deleted the default, promote the next-oldest to default.
  if (existing.isDefault) {
    const next = await prisma.restaurantCustomerAddress.findFirst({
      where: { customerId: me.id },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.restaurantCustomerAddress.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }
  return NextResponse.json({ ok: true });
}
