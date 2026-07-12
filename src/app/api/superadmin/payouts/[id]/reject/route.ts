import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { notifyResellerOfPayoutChange } from "@/lib/reseller-payout-notify";

/**
 * POST /api/superadmin/payouts/[id]/reject
 * body: { reason?: string }
 *
 * Cancels a payout request and returns the included commissions to
 * "available" state so the reseller can try again later (after providing
 * better payout details, fixing a hold-back issue, etc.).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const reason: string | null = body?.reason ? String(body.reason).slice(0, 500) : null;

  const payout = await prisma.payoutRequest.findUnique({ where: { id }, select: { status: true } });
  if (!payout) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["requested", "approved"].includes(payout.status)) {
    return NextResponse.json({ error: `Cannot reject a payout in status "${payout.status}"` }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.payoutRequest.update({
      where: { id },
      data: { status: "rejected", rejectedAt: new Date(), rejectedReason: reason },
    }),
    prisma.commissionTransaction.updateMany({
      where: { payoutRequestId: id },
      data: { payoutRequestId: null, status: "available" },
    }),
  ]);

  // Fire-and-forget — notification with the rejection reason so the
  // reseller can fix the issue and re-request.
  void notifyResellerOfPayoutChange(id, "rejected");

  return NextResponse.json({ ok: true });
}
