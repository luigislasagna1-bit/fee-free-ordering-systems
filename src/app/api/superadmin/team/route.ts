/**
 * Platform team management (Team feature, Luigi 2026-07-12).
 *
 *   GET  — list platform staff (superadmin + platform_support).
 *   POST — invite a new team member: create the User with a random
 *          unguessable password + a 30-day set-password link (the exact
 *          locations-onboarding pattern) and email the invite. No password
 *          ever travels through UI/chat/email.
 *
 * FULL superadmin only — support users can't mint colleagues. Every
 * mutation writes an AdminAuditLog row.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireSuperadmin, writeAuditLog } from "@/lib/platform-auth";
import { ROLES } from "@/lib/roles";
import { sendPlatformTeamInviteEmail } from "@/lib/email";

const STAFF_ROLES = [ROLES.SUPERADMIN, ROLES.PLATFORM_SUPPORT] as const;
const ROLE_LABEL: Record<string, string> = {
  [ROLES.SUPERADMIN]: "Superadmin (full access)",
  [ROLES.PLATFORM_SUPPORT]: "Support (view-only)",
};

export async function GET() {
  const actor = await requireSuperadmin();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await prisma.user.findMany({
    where: { role: { in: [...STAFF_ROLES] } },
    select: {
      id: true, email: true, name: true, role: true, isActive: true, createdAt: true,
      // An unused, unexpired reset token = invite still pending (they never
      // set a password). Cheap enough at team scale.
      resetTokens: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id, email: m.email, name: m.name, role: m.role, isActive: m.isActive,
      createdAt: m.createdAt, invitePending: m.resetTokens.length > 0,
    })),
    selfId: actor.id,
  });
}

export async function POST(req: NextRequest) {
  const actor = await requireSuperadmin();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : null;
  const role = typeof body?.role === "string" ? body.role : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!(STAFF_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
  }

  // Random unguessable stub password — the invitee sets their real one via
  // the emailed link. emailVerifiedAt stamped now: the superadmin vouches,
  // and clicking the link re-proves inbox control (locations pattern).
  const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString("hex"), 12);
  const invitee = await prisma.user.create({
    data: { email, name, passwordHash: randomHash, role, restaurantId: null, emailVerifiedAt: new Date() },
  });
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: { token, userId: invitee.id, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });

  await writeAuditLog({
    actor, action: "team.invite", entity: `user:${invitee.id}`,
    detail: { email, role },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
  let inviteEmailed = false;
  try {
    await sendPlatformTeamInviteEmail({
      to: email,
      name,
      roleLabel: ROLE_LABEL[role] ?? role,
      invitedBy: actor.email ?? "The Fee Free Ordering team",
      inviteUrl: `${baseUrl}/reset-password?token=${token}`,
    });
    inviteEmailed = true;
  } catch (e) {
    // Mail outage must not fail the invite — the account exists; "Resend
    // invite" (or Forgot password) recovers it.
    console.error("[superadmin/team] invite email failed", e);
  }

  return NextResponse.json({ ok: true, id: invitee.id, inviteEmailed });
}
