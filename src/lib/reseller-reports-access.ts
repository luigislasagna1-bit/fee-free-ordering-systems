/**
 * Reseller Reports & Requests — access control. SERVER-ONLY.
 *
 * Constants (badge classes, type/status labels) live in
 * reseller-reports-constants.ts so client components can import them
 * without dragging Prisma + next-auth into the browser bundle.
 *
 * Two access tiers:
 *   Superadmin → full read/write, can change status, can invite/revoke.
 *   Invited reseller (email in ResellerReportInvite) → can read all
 *     reports, create new ones, comment on any. Cannot change status.
 *   Anyone else → 404 from the page, 403 from the API.
 *
 * Every page + route imports `getReportAccess()` so the rules can't drift.
 */
import "server-only";
import prisma from "@/lib/db";
import { getSessionUser, type SessionUser } from "@/lib/session";
import { ROLES } from "@/lib/roles";

// Re-export the constants so callers that already import this module
// keep working (most server routes need both access + constants).
export * from "@/lib/reseller-reports-constants";

export interface ReportAccess {
  canView: boolean;
  canCreate: boolean;
  canComment: boolean;
  canChangeStatus: boolean;
  canInvite: boolean;
  email: string;
  name: string;
  user: SessionUser | null;
}

export async function getReportAccess(): Promise<ReportAccess> {
  const user = await getSessionUser();
  if (!user) return denied(null);

  // Superadmin: full access. Use the REAL role, not effective — a
  // superadmin in SA→reseller impersonation mode should still see
  // their superadmin privileges on this page.
  if (user.role === ROLES.SUPERADMIN) {
    return {
      canView: true,
      canCreate: true,
      canComment: true,
      canChangeStatus: true,
      canInvite: true,
      email: user.email,
      name: user.name || user.email,
      user,
    };
  }

  // Reseller — check the invite allow-list (case-insensitive).
  if (user.role === ROLES.RESELLER_PARTNER) {
    const lower = user.email.trim().toLowerCase();
    if (!lower) return denied(user);
    const invite = await prisma.resellerReportInvite.findUnique({
      where: { email: lower },
      select: { id: true },
    });
    if (!invite) return denied(user);
    return {
      canView: true,
      canCreate: true,
      canComment: true,
      canChangeStatus: false,
      canInvite: false,
      email: user.email,
      name: user.name || user.email,
      user,
    };
  }

  // Pending resellers, restaurant admins, kitchen staff, etc. — no
  // access regardless of invite.
  return denied(user);
}

function denied(user: SessionUser | null): ReportAccess {
  return {
    canView: false,
    canCreate: false,
    canComment: false,
    canChangeStatus: false,
    canInvite: false,
    email: "",
    name: "",
    user,
  };
}
