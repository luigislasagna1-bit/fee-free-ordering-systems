import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isSuperadmin } from "@/lib/roles";

/**
 * POST /api/superadmin/payouts/[id]/approve
 * Move a payout from "requested" → "approved". Doesn't send any money yet —
 * the superadmin still needs to actually pay the reseller (PayPal, bank
 * transfer, etc.) and then hit mark-paid. This intermediate state lets the
 * superadmin "claim" the payout so two superadmins don't double-pay.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!isSuperadmin(user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const payout = await prisma.payoutRequest.findUnique({ where: { id }, select: { status: true } });
  if (!payout) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (payout.status !== "requested") {
    return NextResponse.json({ error: `Cannot approve a payout in status "${payout.status}"` }, { status: 409 });
  }
  await prisma.payoutRequest.update({
    where: { id },
    data: { status: "approved", approvedAt: new Date(), approvedBy: user!.id },
  });
  return NextResponse.json({ ok: true });
}
