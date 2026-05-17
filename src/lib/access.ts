/**
 * Central RBAC helper. Every route should call into this module rather than
 * hand-roll an access check — it's the only place we encode the rules and the
 * only place we test them.
 *
 * Rules:
 *   superadmin        → everything
 *   reseller_partner  → restaurants where Restaurant.resellerProfileId matches
 *                       AND the reseller is approved, plus restaurants with an
 *                       explicit RestaurantAccess grant for that user
 *   restaurant_admin  → their User.restaurantId, plus RestaurantAccess grants
 *                       at role ≥ manager
 *   kitchen_staff     → their User.restaurantId (legacy single-restaurant link)
 *   pending_reseller  → nothing operational. UI redirects them to a holding page.
 *
 * Impersonation:
 *   When SessionUser.isImpersonating is true, the effective restaurantId is
 *   already swapped in by getSessionUser(). The helpers here treat the
 *   impersonated identity as the actor for permission purposes — superadmin
 *   impersonating a restaurant has full access to *that* restaurant; reseller
 *   impersonating a restaurant has whatever access their resellerProfile grants.
 */

import prisma from "@/lib/db";
import {
  ROLES,
  ACCESS_ROLES,
  type AccessRole,
  accessRoleAtLeast,
  isSuperadmin,
  isResellerPartner,
  isRestaurantAdmin,
  isKitchenStaff,
} from "@/lib/roles";
import type { SessionUser } from "@/lib/session";

/** Permission tier required by the caller. Most endpoints need MANAGER. */
export type RequiredAccess = AccessRole;

/**
 * Returns true if the user is allowed to act on the given restaurant at the
 * requested permission level (default: manager — i.e. write access).
 *
 * Logic:
 *   - superadmin: always yes.
 *   - reseller_partner: yes if Restaurant.resellerProfileId === user's profile
 *     AND the profile is approved, OR an explicit RestaurantAccess row exists
 *     with role ≥ required.
 *   - restaurant_admin: yes if User.restaurantId matches (implicit owner) OR
 *     a RestaurantAccess grant at role ≥ required exists.
 *   - kitchen_staff: yes only if User.restaurantId matches AND required ≤ staff.
 */
export async function canActOnRestaurant(
  user: SessionUser | null,
  restaurantId: string,
  required: RequiredAccess = ACCESS_ROLES.MANAGER
): Promise<boolean> {
  if (!user || !restaurantId) return false;

  if (isSuperadmin(user.role)) return true;

  // Implicit owner via legacy User.restaurantId link.
  if (user.restaurantId === restaurantId) {
    if (isKitchenStaff(user.role)) {
      // Kitchen staff are read+limited-write; not allowed beyond staff tier.
      return accessRoleAtLeast(ACCESS_ROLES.STAFF, required);
    }
    return true; // restaurant_admin owners + reseller managers via their owned restaurant
  }

  // Reseller-by-profile path: the reseller's primary access to all linked restaurants.
  if (isResellerPartner(user.role) && user.resellerProfileId) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { resellerProfileId: true },
    });
    if (restaurant?.resellerProfileId === user.resellerProfileId) {
      const profile = await prisma.resellerProfile.findUnique({
        where: { id: user.resellerProfileId },
        select: { status: true },
      });
      if (profile?.status === "approved") {
        // Reseller default access tier is reseller_manager — high enough for
        // anything below owner. Compare against the requested tier.
        return accessRoleAtLeast(ACCESS_ROLES.RESELLER_MANAGER, required);
      }
    }
  }

  // Explicit grant path (RestaurantAccess table). Covers shared admins,
  // resellers granted access on a restaurant outside their profile link, etc.
  const grant = await prisma.restaurantAccess.findUnique({
    where: { userId_restaurantId: { userId: user.id, restaurantId } },
    select: { accessRole: true },
  });
  if (grant && accessRoleAtLeast(grant.accessRole, required)) return true;

  return false;
}

/**
 * Asserting variant — throws an Error("forbidden") if access is denied.
 * Route handlers catch this and return a 403. Useful when you want a
 * single line at the top of a route instead of an if/return dance.
 */
export async function requireRestaurantAccess(
  user: SessionUser | null,
  restaurantId: string,
  required: RequiredAccess = ACCESS_ROLES.MANAGER
): Promise<void> {
  const ok = await canActOnRestaurant(user, restaurantId, required);
  if (!ok) {
    const err = new Error("forbidden");
    (err as any).status = 403;
    throw err;
  }
}

/** Same idea but for the /api/reseller/* surface. */
export async function canActOnReseller(
  user: SessionUser | null,
  resellerProfileId: string
): Promise<boolean> {
  if (!user) return false;
  if (isSuperadmin(user.role)) return true;
  if (isResellerPartner(user.role) && user.resellerProfileId === resellerProfileId) return true;
  return false;
}

export async function requireResellerAccess(
  user: SessionUser | null,
  resellerProfileId: string
): Promise<void> {
  const ok = await canActOnReseller(user, resellerProfileId);
  if (!ok) {
    const err = new Error("forbidden");
    (err as any).status = 403;
    throw err;
  }
}

/**
 * Returns the set of restaurant IDs this user can act on. Used by index/list
 * pages where we'd otherwise have to query restaurants once per visibility
 * tier. Returns null for superadmin to signal "no filter — see everything."
 */
export async function listAccessibleRestaurantIds(
  user: SessionUser | null
): Promise<string[] | null> {
  if (!user) return [];
  if (isSuperadmin(user.role)) return null;

  const ids = new Set<string>();
  if (user.restaurantId) ids.add(user.restaurantId);

  if (isResellerPartner(user.role) && user.resellerProfileId) {
    const profile = await prisma.resellerProfile.findUnique({
      where: { id: user.resellerProfileId },
      select: { status: true },
    });
    if (profile?.status === "approved") {
      const owned = await prisma.restaurant.findMany({
        where: { resellerProfileId: user.resellerProfileId },
        select: { id: true },
      });
      for (const r of owned) ids.add(r.id);
    }
  }

  const grants = await prisma.restaurantAccess.findMany({
    where: { userId: user.id },
    select: { restaurantId: true },
  });
  for (const g of grants) ids.add(g.restaurantId);

  return [...ids];
}

/**
 * Prisma `where` scope helper. Spread into a query so the resulting rows are
 * automatically filtered to what this user can see:
 *
 *   const orders = await prisma.order.findMany({
 *     where: { ...await scopeRestaurantWhere(user), status: "pending" },
 *   });
 *
 * Returns `{}` for superadmin (no filter), `{ restaurantId: { in: ids } }`
 * for everyone else. Returns `{ restaurantId: { in: [] } }` for users with
 * zero accessible restaurants — yields an empty result set rather than
 * accidentally matching everything.
 */
export async function scopeRestaurantWhere(
  user: SessionUser | null
): Promise<{ restaurantId?: { in: string[] } }> {
  const ids = await listAccessibleRestaurantIds(user);
  if (ids === null) return {}; // superadmin
  return { restaurantId: { in: ids } };
}

/** Re-export for convenient `import { ROLES, ACCESS_ROLES } from "@/lib/access"`. */
export { ROLES, ACCESS_ROLES };
