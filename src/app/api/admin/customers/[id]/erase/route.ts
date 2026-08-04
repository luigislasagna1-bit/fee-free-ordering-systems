/**
 * POST /api/admin/customers/[id]/erase
 *
 * Owner-initiated erasure of ONE customer's personal data (CASL/GDPR/PIPEDA),
 * for handling a privacy request from the restaurant's own dashboard. Anonymizes
 * via src/lib/data-erasure.ts (keeps anonymized order records for tax). Same
 * restaurant-scoped ownership guard as the PATCH sibling — a tampered id
 * targeting another restaurant's customer 404s.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { anonymizeCustomerByEmail } from "@/lib/data-erasure";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, restaurantId: true, email: true },
  });
  if (!existing || existing.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }
  if (!existing.email) {
    return NextResponse.json({ error: "This customer has no email on file to erase by." }, { status: 400 });
  }

  const result = await anonymizeCustomerByEmail(restaurantId, existing.email, {
    actor: { via: "admin", userId: user!.id },
  });

  return NextResponse.json({ ok: true, counts: result.counts, stripeStatus: result.stripeStatus });
}
