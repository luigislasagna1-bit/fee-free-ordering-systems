/**
 * GET  /api/public/restaurant-customer/addresses
 * POST /api/public/restaurant-customer/addresses { label?, street, city, state?, zip?, country?, isDefault? }
 *
 * Per-restaurant Customer's saved delivery addresses. List + create.
 * The single-row PATCH/DELETE live at the [id] subroute.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";

const MAX_ADDRESSES = 10;

export async function GET() {
  const me = await getCurrentRestaurantCustomer();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const addresses = await prisma.restaurantCustomerAddress.findMany({
    where: { customerId: me.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ addresses });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentRestaurantCustomer();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const street = String(body?.street ?? "").trim().slice(0, 200);
  const city   = String(body?.city   ?? "").trim().slice(0, 100);
  if (!street || !city) {
    return NextResponse.json({ error: "street and city are required" }, { status: 400 });
  }
  const label   = body?.label   ? String(body.label).trim().slice(0, 30) || null : null;
  const state   = body?.state   ? String(body.state).trim().slice(0, 30)  : null;
  const zip     = body?.zip     ? String(body.zip).trim().slice(0, 20)    : null;
  const country = body?.country ? String(body.country).trim().slice(0, 10) || "CA" : "CA";
  const wantsDefault = !!body?.isDefault;

  // Cap so a malicious client can't pile up rows.
  const count = await prisma.restaurantCustomerAddress.count({ where: { customerId: me.id } });
  if (count >= MAX_ADDRESSES) {
    return NextResponse.json(
      { error: `You can save up to ${MAX_ADDRESSES} addresses. Delete one to add another.` },
      { status: 400 },
    );
  }

  // First address auto-defaults so the picker has something to highlight.
  const isDefault = wantsDefault || count === 0;

  // Clear any prior default if this one is taking the slot.
  if (isDefault) {
    await prisma.restaurantCustomerAddress.updateMany({
      where: { customerId: me.id, isDefault: true },
      data: { isDefault: false },
    });
  }
  const created = await prisma.restaurantCustomerAddress.create({
    data: { customerId: me.id, label, street, city, state, zip, country, isDefault },
  });
  return NextResponse.json({ address: created }, { status: 201 });
}
