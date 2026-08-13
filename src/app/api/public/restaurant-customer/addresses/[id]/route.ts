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

  // Pin-confirmed coords travel as a PAIR: both finite + plausible → stored,
  // anything else (incl. explicit nulls) → cleared. Without this branch the
  // route silently dropped lat/lng, so a coordinate could never be added or
  // corrected on an existing row (2026-08-01 checkout-address follow-up).
  if (body.lat !== undefined || body.lng !== undefined) {
    const latN = Number(body.lat), lngN = Number(body.lng);
    const plausible = Number.isFinite(latN) && Number.isFinite(lngN)
      && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180 && !(latN === 0 && lngN === 0);
    data.lat = plausible ? latN : null;
    data.lng = plausible ? lngN : null;
  } else if (
    // Address text changed with no fresh coords → the stored pin now points at
    // the OLD address. Same rule as checkout: edited text invalidates the pin
    // (the backfill/geocode lane re-resolves from text). Unchanged text keeps it.
    (data.street !== undefined && data.street !== existing.street) ||
    (data.city !== undefined && data.city !== existing.city) ||
    (data.zip !== undefined && data.zip !== existing.zip)
  ) {
    data.lat = null;
    data.lng = null;
  }

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
