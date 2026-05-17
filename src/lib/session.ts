import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "./auth";
import { kitchenAuthOptions } from "./auth-kitchen";
import { cookies } from "next/headers";
import prisma from "./db";

export const IMPERSONATE_COOKIE = "sa_impersonate";
// Reseller "view as restaurant" — same shape as superadmin impersonation but
// only honored when the requester is a reseller_partner AND the target
// restaurant is in their access set. Set/cleared via /api/reseller/impersonate.
export const PARTNER_IMPERSONATE_COOKIE = "partner_impersonate";
// Superadmin "log in as reseller" — superadmin assumes the identity of a
// specific ResellerProfile. Distinct from `sa_impersonate` (which targets a
// Restaurant). Set/cleared via /api/superadmin/resellers/[id]/impersonate.
export const SA_RESELLER_IMPERSONATE_COOKIE = "sa_reseller_impersonate";
// Multi-location: a restaurant_admin who owns the parent Restaurant can
// switch which child location they're administering. Same JWT, same role —
// just swaps the effective restaurantId. Validated against the owner's
// parent + RestaurantAccess on the target. Set/cleared via /api/restaurants/locations/switch.
export const ACTIVE_LOCATION_COOKIE = "active_location";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantId: string | undefined;
  restaurantSlug: string | undefined;
  /** ResellerProfile.id when role === "reseller_partner". Undefined otherwise. */
  resellerProfileId: string | undefined;
  isImpersonating: boolean;
  /** Distinguishes which kind of impersonation is active.
   *  - "superadmin": superadmin viewing a restaurant via sa_impersonate
   *  - "reseller": reseller viewing one of their restaurants via partner_impersonate
   *  - "superadmin_as_reseller": superadmin assuming a reseller's identity (also
   *    able to chain into restaurant impersonation via sa_impersonate)
   */
  impersonationMode: "superadmin" | "reseller" | "superadmin_as_reseller" | null;
}

function baseFromSession(session: Session | null): SessionUser | null {
  if (!session?.user) return null;
  const user = session.user as any;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    restaurantId: user.restaurantId ?? undefined,
    restaurantSlug: user.restaurantSlug ?? undefined,
    resellerProfileId: user.resellerProfileId ?? undefined,
    isImpersonating: false,
    impersonationMode: null,
  };
}

/**
 * Validate that a reseller is allowed to impersonate the given restaurant.
 * Re-checks the DB (we don't trust the cookie alone) — confirms the restaurant
 * is linked to the reseller's profile AND the profile is approved.
 */
async function resellerCanImpersonate(
  resellerProfileId: string | undefined,
  restaurantId: string
): Promise<boolean> {
  if (!resellerProfileId) return false;
  const [restaurant, profile] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { resellerProfileId: true },
    }),
    prisma.resellerProfile.findUnique({
      where: { id: resellerProfileId },
      select: { status: true },
    }),
  ]);
  return (
    restaurant?.resellerProfileId === resellerProfileId &&
    profile?.status === "approved"
  );
}

/**
 * Returns the effective session user.
 *
 * The admin and kitchen session cookies can coexist in the same browser. This
 * helper resolves both, applies impersonation (superadmin or reseller) if
 * active, and picks the session that actually has a usable `restaurantId`.
 * A stale cookie (no restaurantId, no impersonation) falls through.
 *
 * `preferKitchen: true` tips the tie-breaker toward the kitchen session when
 * both have a restaurantId. Used by kitchen-originated endpoints.
 */
export async function getSessionUser(opts?: { preferKitchen?: boolean }): Promise<SessionUser | null> {
  const [adminSession, kitchenSession] = await Promise.all([
    getServerSession(authOptions),
    getServerSession(kitchenAuthOptions),
  ]);

  const cookieStore = await cookies();
  const saImpersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  const partnerImpersonateId = cookieStore.get(PARTNER_IMPERSONATE_COOKIE)?.value;
  const saResellerImpersonateId = cookieStore.get(SA_RESELLER_IMPERSONATE_COOKIE)?.value;
  const activeLocationId = cookieStore.get(ACTIVE_LOCATION_COOKIE)?.value;

  // Build the candidate users without impersonation first.
  const adminUserBase = baseFromSession(adminSession);
  const kitchenUserBase = baseFromSession(kitchenSession);

  // Apply impersonation cookies in this priority order for a superadmin:
  //   1. sa_reseller_impersonate — superadmin becomes a reseller_partner
  //   2. sa_impersonate — superadmin becomes a restaurant operator
  // Both can chain (SA → reseller → restaurant): if both are set, the SA→reseller
  // identity is applied first, then sa_impersonate further swaps the restaurantId.
  async function applyImpersonation(user: SessionUser | null): Promise<SessionUser | null> {
    if (!user) return null;

    // Superadmin assuming a reseller's identity.
    let workingUser = user;
    if (workingUser.role === "superadmin" && saResellerImpersonateId) {
      const profile = await prisma.resellerProfile.findUnique({
        where: { id: saResellerImpersonateId },
        select: { status: true },
      });
      if (profile) {
        workingUser = {
          ...workingUser,
          role: "reseller_partner",
          resellerProfileId: saResellerImpersonateId,
          // Carry the SA→reseller mode; subsequent restaurant swap won't overwrite it.
          isImpersonating: true,
          impersonationMode: "superadmin_as_reseller",
        };
      }
      // If profile is missing, silently strip and continue as plain superadmin.
    }

    // Restaurant-level impersonation. Superadmin OR (post-swap) superadmin-as-reseller
    // can use sa_impersonate. A real reseller uses partner_impersonate.
    if (
      (workingUser.role === "superadmin" || workingUser.impersonationMode === "superadmin_as_reseller") &&
      saImpersonateId
    ) {
      return {
        ...workingUser,
        restaurantId: saImpersonateId,
        isImpersonating: true,
        // Preserve "superadmin_as_reseller" if it was set; otherwise mark "superadmin".
        impersonationMode: workingUser.impersonationMode ?? "superadmin",
      };
    }
    if (workingUser.role === "reseller_partner" && partnerImpersonateId) {
      const allowed = await resellerCanImpersonate(workingUser.resellerProfileId, partnerImpersonateId);
      if (allowed) {
        return {
          ...workingUser,
          restaurantId: partnerImpersonateId,
          isImpersonating: true,
          // Preserve "superadmin_as_reseller" if SA-chained; otherwise plain "reseller".
          impersonationMode: workingUser.impersonationMode ?? "reseller",
        };
      }
      // Cookie present but no longer valid — strip silently.
    }
    return workingUser;
  }

  const [adminUser, kitchenUser] = await Promise.all([
    applyImpersonation(adminUserBase),
    applyImpersonation(kitchenUserBase),
  ]);

  const primary  = opts?.preferKitchen ? kitchenUser : adminUser;
  const fallback = opts?.preferKitchen ? adminUser  : kitchenUser;

  // Pick the resolved user before active-location swap.
  const chosen = primary?.restaurantId ? primary
    : fallback?.restaurantId ? fallback
    : (primary ?? fallback ?? null);

  // Active-location swap. Only applies to a non-impersonating restaurant_admin
  // who owns the parent and is switching to one of its sibling locations.
  // (Impersonators already targeted a specific restaurant — don't re-swap.)
  if (
    chosen &&
    !chosen.isImpersonating &&
    chosen.role === "restaurant_admin" &&
    chosen.restaurantId &&
    activeLocationId &&
    activeLocationId !== chosen.restaurantId
  ) {
    const allowed = await ownerCanSwitchToLocation(chosen.restaurantId, activeLocationId);
    if (allowed) {
      return { ...chosen, restaurantId: activeLocationId };
    }
    // Cookie present but invalid — silently ignore.
  }

  return chosen;
}

/**
 * The user's User.restaurantId points at the brand's parent Restaurant. A
 * valid switch target is either that same parent OR one of its children
 * (Restaurant.parentRestaurantId === parent.id).
 */
async function ownerCanSwitchToLocation(
  parentId: string,
  targetId: string
): Promise<boolean> {
  if (parentId === targetId) return true; // switching "back" to the parent itself
  const target = await prisma.restaurant.findUnique({
    where: { id: targetId },
    select: { parentRestaurantId: true },
  });
  return target?.parentRestaurantId === parentId;
}
