/**
 * POST /api/superadmin/team/[id]/resend-invite — burn any unused invite
 * tokens and mail a fresh 30-day set-password link. For team members who
 * lost/expired the original invite (invitePending in the team list).
 * FULL superadmin only; audited.
 */
import { NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import { requireSuperadmin, writeAuditLog } from "@/lib/platform-auth";
import { ROLES } from "@/lib/roles";
import { sendPlatformTeamInviteEmail } from "@/lib/email";

const STAFF_ROLES: readonly string[] = [ROLES.SUPERADMIN, ROLES.PLATFORM_SUPPORT];
const ROLE_LABEL: Record<string, string> = {
  [ROLES.SUPERADMIN]: "Superadmin (full access)",
  [ROLES.PLATFORM_SUPPORT]: "Support (view-only)",
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireSuperadmin();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!target || !STAFF_ROLES.includes(target.role)) {
    return NextResponse.json({ error: "Not a platform team member." }, { status: 404 });
  }
  if (!target.isActive) {
    return NextResponse.json({ error: "Reactivate the account before resending its invite." }, { status: 400 });
  }

  // Burn outstanding unused tokens so exactly one live link exists.
  await prisma.passwordResetToken.updateMany({
    where: { userId: target.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { token, userId: target.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  try {
    await sendPlatformTeamInviteEmail({
      to: target.email,
      name: target.name,
      roleLabel: ROLE_LABEL[target.role] ?? target.role,
      invitedBy: actor.email ?? "The Fee Free Ordering team",
      inviteUrl: `${baseUrl}/reset-password?token=${token}`,
    });
  } catch (e) {
    console.error("[superadmin/team] resend-invite email failed", e);
    return NextResponse.json({ error: "Could not send the email — try again." }, { status: 500 });
  }

  await writeAuditLog({
    actor, action: "team.invite-resend", entity: `user:${target.id}`, detail: { email: target.email },
  });
  return NextResponse.json({ ok: true });
}
