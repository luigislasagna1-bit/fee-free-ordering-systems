/**
 * PATCH /api/admin/customers/[id]
 *
 * Restaurant-admin update for a Customer row. Handles:
 *   - private internal notes — restaurant-side memo that's never shown
 *     to the customer ("Allergic to peanuts", "VIP", "Complained 2026-05-12
 *     — gave 10% off code", etc.)
 *   - rewardEarnPercent — personal earn-rate override (percent of the earn
 *     basis; beats the base rate and any VIP group rate; null = no override)
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

  let body: { notes?: string | null; rewardEarnPercent?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { notes?: string | null; rewardEarnPercent?: number | null } = {};

  // Cap notes length to keep the column from growing unbounded. 2000
  // chars = ~400 words, plenty for the "VIP / Allergic / Complaint
  // history" use case without inviting unbounded prose. UI also
  // surfaces a counter so the owner sees the cap before saving.
  // Only touched when the request carries the key — a PATCH for the
  // earn rate alone must not blank the owner's notes.
  const NOTES_MAX = 2000;
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === "string"
      ? body.notes.slice(0, NOTES_MAX)
      : null;
  }

  // Personal earn-rate override (percent of the earn basis; 10 = 10% back —
  // beats the base rate AND any VIP group rate). null OR any value ≤ 0
  // CLEARS the override (review 2026-07-19: clamping 0 up to 0.01% silently
  // DOWNGRADED the customer below the base rate); a positive finite number is
  // clamped to ≤100 and rounded to 2dp; anything else is a 400 — never a
  // silent no-op that the UI toasts "Saved" over.
  if (body.rewardEarnPercent !== undefined) {
    if (body.rewardEarnPercent === null || (typeof body.rewardEarnPercent === "number" && Number.isFinite(body.rewardEarnPercent) && body.rewardEarnPercent <= 0)) {
      data.rewardEarnPercent = null;
    } else if (typeof body.rewardEarnPercent === "number" && Number.isFinite(body.rewardEarnPercent)) {
      data.rewardEarnPercent = Math.round(Math.min(100, body.rewardEarnPercent) * 100) / 100;
    } else {
      return NextResponse.json({ error: "rewardEarnPercent must be a number or null" }, { status: 400 });
    }
  }

  await prisma.customer.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true });
}
