import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/superadmin/driver-payouts/[id]/mark-paid
 * body: { payoutReference?: string, notes?: string }
 *
 * Records that Fee Free has manually paid a driver's weekly payout. The money
 * moves outside the system (e-transfer / cash / etc.); this flag is the ONLY
 * guard against paying twice, so the flip is ATOMIC and only from "pending":
 * a concurrent second click sees count===0 → 409. A `paid` row is immutable.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payoutReference: string | null = body?.payoutReference ? String(body.payoutReference).slice(0, 200) : null;
  const notes: string | null = body?.notes ? String(body.notes).slice(0, 2000) : null;

  const existing = await prisma.driverPayout.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Atomic guarded transition — the where-clause on status:"pending" is the
  // double-pay guard; a racing second click flips zero rows.
  const res = await prisma.driverPayout.updateMany({
    where: { id, status: "pending" },
    data: { status: "paid", paidAt: new Date(), paidBy: user.id, payoutReference, notes },
  });
  if (res.count === 0) {
    return NextResponse.json({ error: "Already paid or not pending", code: "not_pending" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
