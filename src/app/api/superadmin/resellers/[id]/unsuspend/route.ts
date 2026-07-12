import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";

/**
 * POST /api/superadmin/resellers/[id]/unsuspend
 * Reverses a previous suspension — flips status back to "approved". Does not
 * retroactively credit commissions for invoices paid during the suspension
 * window (those rows have already been written with the rate/state at the
 * time of payment).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const profile = await prisma.resellerProfile.findUnique({ where: { id }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.resellerProfile.update({
    where: { id },
    data: {
      status: "approved",
      suspendedAt: null,
      suspendedReason: null,
    },
  });

  return NextResponse.json({ ok: true });
}
