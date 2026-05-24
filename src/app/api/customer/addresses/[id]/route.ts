/**
 * PATCH  /api/customer/addresses/[id]  — update an address
 * DELETE /api/customer/addresses/[id]  — remove an address
 *
 * Ownership check: the address must belong to the signed-in customer
 * account. Customer-supplied IDs are never trusted — the where clause
 * always scopes to `customerAccountId: me.id` so you can't tamper with
 * someone else's saved addresses by guessing IDs.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentCustomer();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;

  let body: {
    label?: string | null;
    street?: string;
    city?: string;
    state?: string | null;
    zip?: string | null;
    country?: string;
    isDefault?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verify ownership BEFORE touching any default-flag flipping logic.
  const existing = await prisma.customerAddress.findFirst({
    where: { id, customerAccountId: me.id },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // If the caller is promoting this address to default, demote any sibling
  // first. Done in a transaction so we never end up with two defaults.
  if (body.isDefault === true) {
    await prisma.$transaction([
      prisma.customerAddress.updateMany({
        where: { customerAccountId: me.id, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      }),
      prisma.customerAddress.update({
        where: { id },
        data: { isDefault: true },
      }),
    ]);
  }

  const address = await prisma.customerAddress.update({
    where: { id },
    data: {
      ...(body.label !== undefined ? { label: body.label?.toString().trim().slice(0, 40) || null } : {}),
      ...(body.street !== undefined ? { street: body.street.toString().trim().slice(0, 200) } : {}),
      ...(body.city !== undefined ? { city: body.city.toString().trim().slice(0, 100) } : {}),
      ...(body.state !== undefined ? { state: body.state?.toString().trim().slice(0, 80) || null } : {}),
      ...(body.zip !== undefined ? { zip: body.zip?.toString().trim().slice(0, 20) || null } : {}),
      ...(body.country !== undefined ? { country: body.country.toString().trim().slice(0, 2) || "CA" } : {}),
    },
  });
  return NextResponse.json({ address });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentCustomer();
  if (!me) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { id } = await params;

  // Scoped delete — only succeeds if the address belongs to the caller.
  // deleteMany doesn't throw if the row doesn't exist; count tells us
  // whether anything was actually deleted.
  const result = await prisma.customerAddress.deleteMany({
    where: { id, customerAccountId: me.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
