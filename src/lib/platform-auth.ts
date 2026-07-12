/**
 * Request-level guards for the /superadmin area + /api/superadmin routes,
 * and the platform audit-log writer (Team feature, Luigi 2026-07-12).
 *
 * Before this module the superadmin check was COPY-PASTED across ~28 route
 * files in four drifting styles (getServerSession vs getSessionUser, inline
 * string compare vs isSuperadmin, 401 vs 403). One guard, two tiers:
 *
 *   requireSuperadmin()    — FULL platform operator. Mutations, money
 *                            (plans/add-ons/payouts), platform secrets
 *                            (Stripe/email/maps/company), impersonation,
 *                            team management.
 *   requirePlatformStaff() — superadmin OR platform_support. Read-mostly
 *                            endpoints: restaurant/reseller/report viewing.
 *
 * Both return the SessionUser on success or null on refusal — callers
 * respond `403 Forbidden` on null (an authenticated-but-unauthorized caller
 * is a 403, not a 401; kept uniform across the sweep). Deactivated accounts
 * are refused here as belt-and-suspenders even though login already blocks
 * them (a stale session must not outlive deactivation by its JWT lifetime).
 */
import prisma from "@/lib/db";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { isPlatformStaff, isSuperadmin } from "@/lib/roles";

async function requireRole(check: (role: string) => boolean): Promise<SessionUser | null> {
  const user = await getSessionUser();
  if (!user?.role || !check(user.role)) return null;
  // Deactivation must bite immediately, not when the JWT expires. One indexed
  // primary-key read per privileged request — platform routes are not a
  // customer hot path.
  const row = await prisma.user.findUnique({ where: { id: user.id }, select: { isActive: true } });
  if (!row?.isActive) return null;
  return user;
}

export function requireSuperadmin(): Promise<SessionUser | null> {
  return requireRole(isSuperadmin);
}

export function requirePlatformStaff(): Promise<SessionUser | null> {
  return requireRole(isPlatformStaff);
}

/** Append one audit row. Fire-and-forget safe: never throws (an audit-write
 *  hiccup must not fail the admin action it records — but it is awaited where
 *  the row IS the point, e.g. team mutations). */
export async function writeAuditLog(args: {
  actor: Pick<SessionUser, "id" | "email" | "role">;
  action: string;
  entity?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: args.actor.id,
        actorEmail: args.actor.email ?? "",
        actorRole: args.actor.role ?? "",
        action: args.action,
        entity: args.entity,
        detail: args.detail as never,
      },
    });
  } catch (e) {
    console.error("[audit] write failed", { action: args.action, entity: args.entity, e });
  }
}
