import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isSuperadmin, ROLES } from "@/lib/roles";

/**
 * POST /api/superadmin/resellers/[id]/approve
 * Flips ResellerProfile.status to "approved" AND promotes the underlying
 * User.role from pending_reseller → reseller_partner so they can log in to
 * the reseller dashboard. Idempotent.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!isSuperadmin(user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const profile = await prisma.resellerProfile.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction([
    prisma.resellerProfile.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: user!.id,
        suspendedAt: null,
        suspendedReason: null,
      },
    }),
    prisma.user.update({
      where: { id: profile.userId },
      data: { role: ROLES.RESELLER_PARTNER },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
