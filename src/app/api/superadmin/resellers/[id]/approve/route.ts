import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { ROLES } from "@/lib/roles";
import { notifyResellerOfApplicationChange } from "@/lib/reseller-application-notify";

/**
 * POST /api/superadmin/resellers/[id]/approve
 * Flips ResellerProfile.status to "approved" AND promotes the underlying
 * User.role from pending_reseller → reseller_partner so they can log in to
 * the reseller dashboard. Idempotent.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const profile = await prisma.resellerProfile.findUnique({
    where: { id },
    select: { id: true, userId: true, status: true },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const wasAlreadyApproved = profile.status === "approved";
  await prisma.$transaction([
    prisma.resellerProfile.update({
      where: { id },
      data: {
        status: "approved",
        approvedAt: new Date(),
        approvedBy: user.id,
        suspendedAt: null,
        suspendedReason: null,
      },
    }),
    prisma.user.update({
      where: { id: profile.userId },
      data: { role: ROLES.RESELLER_PARTNER },
    }),
  ]);

  // Notify the partner — but only if this is a real state change. The
  // endpoint is idempotent so the superadmin could click Approve on an
  // already-approved row; we don't want to spam them with a second
  // welcome email in that case.
  if (!wasAlreadyApproved) {
    void notifyResellerOfApplicationChange(id, "approved");
  }

  return NextResponse.json({ ok: true });
}
