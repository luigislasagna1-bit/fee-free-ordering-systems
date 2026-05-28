/**
 * PATCH /api/admin/customers/[id]
 *
 * Restaurant-admin update for a Customer row. Today only handles
 * private internal notes — restaurant-side memo that's never shown
 * to the customer ("Allergic to peanuts", "VIP", "Complained 2026-05-12
 * — gave 10% off code", etc.).
 *
 * Restaurant-scoped: the customer's restaurantId must match the
 * session's restaurantId; a tampered URL targeting another restaurant's
 * customer 404s. No body fields outside the explicit allow-list reach
 * the DB.
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const existing = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, restaurantId: true },
  });
  if (!existing || existing.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  let body: { notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Cap notes length to keep the column from growing unbounded. 2000
  // chars = ~400 words, plenty for the "VIP / Allergic / Complaint
  // history" use case without inviting unbounded prose. UI also
  // surfaces a counter so the owner sees the cap before saving.
  const NOTES_MAX = 2000;
  const notes = typeof body.notes === "string"
    ? body.notes.slice(0, NOTES_MAX)
    : null;

  await prisma.customer.update({
    where: { id },
    data: { notes },
  });

  return NextResponse.json({ ok: true });
}
