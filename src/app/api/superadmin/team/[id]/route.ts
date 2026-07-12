/**
 * PATCH /api/superadmin/team/[id] — change a platform team member's role or
 * active state. POST is not exposed here; invites live on the collection
 * route, resends on [id]/resend-invite.
 *
 * Safety rails (all server-enforced; the UI mirrors them):
 *   - target must BE a platform-staff row — this endpoint can't touch
 *     restaurant/reseller/kitchen users.
 *   - no self-service: you can't change your own role or deactivate yourself
 *     (prevents the classic locked-out-the-only-admin foot-gun).
 *   - the LAST ACTIVE superadmin can never be demoted or deactivated.
 * Every change writes an AdminAuditLog row.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin, writeAuditLog } from "@/lib/platform-auth";
import { ROLES } from "@/lib/roles";

const STAFF_ROLES: readonly string[] = [ROLES.SUPERADMIN, ROLES.PLATFORM_SUPPORT];

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireSuperadmin();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true, isActive: true },
  });
  if (!target || !STAFF_ROLES.includes(target.role)) {
    return NextResponse.json({ error: "Not a platform team member." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const nextRole = typeof body?.role === "string" ? body.role : undefined;
  const nextActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;
  if (nextRole === undefined && nextActive === undefined) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }
  if (nextRole !== undefined && !STAFF_ROLES.includes(nextRole)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const isSelf = target.id === actor.id;
  if (isSelf && (nextRole !== undefined && nextRole !== target.role)) {
    return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
  }
  if (isSelf && nextActive === false) {
    return NextResponse.json({ error: "You can't deactivate your own account." }, { status: 400 });
  }

  // Last-active-superadmin rail: demotion or deactivation of a superadmin
  // requires at least one OTHER active superadmin to remain.
  const losesSuperadmin =
    target.role === ROLES.SUPERADMIN &&
    ((nextRole !== undefined && nextRole !== ROLES.SUPERADMIN) || nextActive === false);
  if (losesSuperadmin) {
    const others = await prisma.user.count({
      where: { role: ROLES.SUPERADMIN, isActive: true, id: { not: target.id } },
    });
    if (others === 0) {
      return NextResponse.json(
        { error: "This is the last active superadmin — add another before demoting or deactivating it." },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(nextRole !== undefined ? { role: nextRole } : {}),
      ...(nextActive !== undefined ? { isActive: nextActive } : {}),
    },
    select: { id: true, email: true, role: true, isActive: true },
  });

  await writeAuditLog({
    actor,
    action:
      nextActive === false ? "team.deactivate"
      : nextActive === true && target.isActive === false ? "team.activate"
      : "team.role",
    entity: `user:${target.id}`,
    detail: {
      email: target.email,
      ...(nextRole !== undefined ? { oldRole: target.role, newRole: nextRole } : {}),
      ...(nextActive !== undefined ? { isActive: nextActive } : {}),
    },
  });

  return NextResponse.json({ ok: true, member: updated });
}
