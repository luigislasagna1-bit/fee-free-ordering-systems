/**
 * POST /api/admin/customers/[id]/reward-grant  — body { amount, note? }
 *
 * Manual Reward Dollars grant / adjustment for one customer. Positive amount =
 * grant; negative = deduct (the ledger clamps the balance ≥0). Restaurant-scoped:
 * the customer must belong to the session's restaurant (tampered URL → 404).
 * Returns the new balance + recent ledger so the UI updates without a reload.
 * Luigi 2026-06-27.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { grant, getBalance } from "@/lib/reward-ledger";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { id: true, restaurantId: true },
  });
  if (!customer || customer.restaurantId !== restaurantId) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Feature must be on for the restaurant.
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { rewardsEnabled: true } });
  if (!r?.rewardsEnabled) return NextResponse.json({ error: "Reward Dollars is off" }, { status: 400 });

  let body: { amount?: number; note?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "Enter a non-zero amount" }, { status: 400 });
  }
  if (Math.abs(amount) > 1_000_000) {
    return NextResponse.json({ error: "Amount too large" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;

  const res = await grant({
    restaurantId,
    customerId: customer.id,
    amount,
    reason: amount > 0 ? "grant" : "adjust",
    note,
  });
  if (!res.ok) return NextResponse.json({ error: "Could not apply the adjustment" }, { status: 500 });

  const balance = await getBalance({ restaurantId, customerId: customer.id });
  const acct = await prisma.rewardAccount.findUnique({
    where: { restaurantId_customerId: { restaurantId, customerId: customer.id } },
    select: { ledger: { orderBy: { createdAt: "desc" }, take: 10, select: { id: true, amount: true, reason: true, note: true, createdAt: true } } },
  });
  return NextResponse.json({
    ok: true,
    balance,
    ledger: (acct?.ledger ?? []).map((l) => ({ id: l.id, amount: l.amount, reason: l.reason, note: l.note, createdAt: l.createdAt.toISOString() })),
  });
}
