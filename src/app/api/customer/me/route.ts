/**
 * GET  /api/customer/me — returns the current customer's profile + saved
 *                        addresses. 401 when not signed in.
 * PATCH /api/customer/me — update name / phone (email is immutable here;
 *                        a separate change-email flow would handle that).
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";

export async function GET() {
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const addresses = await prisma.customerAddress.findMany({
    where: { customerAccountId: account.id },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ account, addresses });
}

export async function PATCH(req: NextRequest) {
  const account = await getCurrentCustomer();
  if (!account) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { name?: string | null; phone?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updated = await prisma.customerAccount.update({
    where: { id: account.id },
    data: {
      // Only persist explicitly provided keys (allows clearing with null).
      ...(body.name !== undefined ? { name: body.name?.trim() || null } : {}),
      ...(body.phone !== undefined ? { phone: body.phone?.trim() || null } : {}),
    },
    select: { id: true, email: true, name: true, phone: true, emailVerifiedAt: true },
  });
  return NextResponse.json({ account: updated });
}
