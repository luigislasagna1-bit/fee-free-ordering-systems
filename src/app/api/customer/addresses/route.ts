/**
 * GET  /api/customer/addresses  — list the signed-in customer's saved addresses
 * POST /api/customer/addresses  — create a new saved address
 *
 * Auth: requires a customer session (NOT a restaurant-owner session).
 *
 * Limits: at most 10 saved addresses per account (sane UI cap — anyone
 * with more than that on file probably has stale entries that should be
 * cleaned up first).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";

const MAX_ADDRESSES_PER_ACCOUNT = 10;

export async function GET() {
  const me = await getCurrentCustomer();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const addresses = await prisma.customerAddress.findMany({
    where: { customerAccountId: me.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ addresses });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentCustomer();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  let body: {
    label?: string;
    street?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    isDefault?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const street = (body.street || "").trim().slice(0, 200);
  const city = (body.city || "").trim().slice(0, 100);
  if (!street || !city) {
    return NextResponse.json({ error: "Street and city are required" }, { status: 400 });
  }

  // Cap to prevent table-bloat by a single account.
  const existing = await prisma.customerAddress.count({
    where: { customerAccountId: me.id },
  });
  if (existing >= MAX_ADDRESSES_PER_ACCOUNT) {
    return NextResponse.json(
      { error: `You can save up to ${MAX_ADDRESSES_PER_ACCOUNT} addresses. Delete one before adding a new one.` },
      { status: 400 },
    );
  }

  const isDefault = !!body.isDefault || existing === 0;
  // If this one is being set as default, clear any other defaults first
  // so the unique-default invariant holds without a DB constraint.
  if (isDefault) {
    await prisma.customerAddress.updateMany({
      where: { customerAccountId: me.id, isDefault: true },
      data: { isDefault: false },
    });
  }

  const address = await prisma.customerAddress.create({
    data: {
      customerAccountId: me.id,
      label: body.label?.trim().slice(0, 40) || null,
      street,
      city,
      state: body.state?.trim().slice(0, 80) || null,
      zip: body.zip?.trim().slice(0, 20) || null,
      country: body.country?.trim().slice(0, 2) || "CA",
      isDefault,
    },
  });
  return NextResponse.json({ address }, { status: 201 });
}
