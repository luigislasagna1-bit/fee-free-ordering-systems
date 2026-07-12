import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { notifyResellerOfPayoutChange } from "@/lib/reseller-payout-notify";

/**
 * POST /api/superadmin/payouts/[id]/mark-paid
 * body: { payoutReference?: string, notes?: string }
 *
 * Final step in the payout flow. Flips status → "paid", flips the included
 * commissions to status="paid", and increments the reseller's
 * totalPaidCents counter. Allowed from either "approved" or "requested"
 * state (sometimes the superadmin pays first then comes back to record it).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payoutReference: string | null = body?.payoutReference
    ? String(body.payoutReference).slice(0, 200)
    : null;
  const notes: string | null = body?.notes ? String(body.notes).slice(0, 2000) : null;

  const payout = await prisma.payoutRequest.findUnique({
    where: { id },
    select: { id: true, status: true, amountCents: true, resellerProfileId: true },
  });
  if (!payout) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["requested", "approved"].includes(payout.status)) {
    return NextResponse.json({ error: `Cannot mark-paid a payout in status "${payout.status}"` }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.payoutRequest.update({
      where: { id },
      data: {
        status: "paid",
        paidAt: new Date(),
        paidBy: user.id,
        payoutReference,
        notes,
      },
    }),
    prisma.commissionTransaction.updateMany({
      where: { payoutRequestId: id },
      data: { status: "paid" },
    }),
    prisma.resellerProfile.update({
      where: { id: payout.resellerProfileId },
      data: { totalPaidCents: { increment: payout.amountCents } },
    }),
  ]);

  // Fire-and-forget — the celebratory "your money has been sent" email
  // with the payout reference for matching to their own records.
  void notifyResellerOfPayoutChange(id, "paid");

  return NextResponse.json({ ok: true });
}
