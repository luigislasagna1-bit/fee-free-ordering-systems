import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "./auth";
import { kitchenAuthOptions } from "./auth-kitchen";
import { cookies } from "next/headers";

export const IMPERSONATE_COOKIE = "sa_impersonate";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantId: string | undefined;
  restaurantSlug: string | undefined;
  isImpersonating: boolean;
}

function makeSessionUser(session: Session | null, impersonateId: string | undefined): SessionUser | null {
  if (!session?.user) return null;
  const user = session.user as any;
  if (user.role === "superadmin" && impersonateId) {
    return { ...user, restaurantId: impersonateId, isImpersonating: true };
  }
  return { ...user, isImpersonating: false };
}

/**
 * Returns the effective session user.
 *
 * The admin and kitchen session cookies can coexist in the same browser. This
 * helper resolves both, applies superadmin impersonation if active, and picks
 * the session that actually has a usable `restaurantId`. A stale superadmin
 * admin-cookie (no restaurantId, no impersonation) will automatically fall
 * through to the kitchen session — so endpoints don't 401 on the wrong cookie.
 *
 * `preferKitchen: true` tips the tie-breaker toward the kitchen session when
 * both have a restaurantId. Used by kitchen-originated endpoints (printnode,
 * test-order, kitchen orders fetch).
 */
export async function getSessionUser(opts?: { preferKitchen?: boolean }): Promise<SessionUser | null> {
  const [adminSession, kitchenSession] = await Promise.all([
    getServerSession(authOptions),
    getServerSession(kitchenAuthOptions),
  ]);

  const cookieStore = await cookies();
  const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;

  const adminUser = makeSessionUser(adminSession, impersonateId);
  const kitchenUser = makeSessionUser(kitchenSession, impersonateId);

  const primary  = opts?.preferKitchen ? kitchenUser : adminUser;
  const fallback = opts?.preferKitchen ? adminUser  : kitchenUser;

  // 1. Prefer whichever has a usable restaurantId in the preferred order.
  if (primary && primary.restaurantId) return primary;
  if (fallback && fallback.restaurantId) return fallback;

  // 2. Neither has a restaurantId — return whichever is signed in (e.g. a
  //    non-impersonating superadmin still needs to authenticate as themselves).
  return primary ?? fallback ?? null;
}
