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
  /** The user's actual role from their JWT. Never changes from impersonation —
   *  use this for API authorization checks ("is this person actually a superadmin?"). */
  role: string;
  /** The role the user is currently *acting as*. Same as `role` unless an
   *  impersonation cookie swaps the experience (e.g. a superadmin doing
   *  SA→reseller sees `effectiveRole = "reseller_partner"`). Use this for UI
   *  routing and reseller-context API endpoints. */
  effectiveRole: string;
  restaurantId: string | undefined;
  restaurantSlug: string | undefined;
  /** ResellerProfile.id — set when effectiveRole === "reseller_partner". */
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

/** True when the user is acting as a reseller — real reseller OR a superadmin
 *  who's currently in SA→reseller impersonation. Use this on /reseller pages
 *  and /api/reseller endpoints. */
export function isResellerView(user: SessionUser | null): boolean {
  return user?.effectiveRole === "reseller_partner";
}

function baseFromSession(session: Session | null): SessionUser | null {
  if (!session?.user) return null;
  const user = session.user as any;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    effectiveRole: user.role,
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

    let workingUser = user;

    // Step 1: SA → reseller. Only swaps the *effective* role + resellerProfileId.
    // The underlying `role` STAYS "superadmin" so superadmin-only APIs keep
    // working while the SA browses the reseller portal.
    if (workingUser.role === "superadmin" && saResellerImpersonateId) {
      const profile = await prisma.resellerProfile.findUnique({
        where: { id: saResellerImpersonateId },
        select: { status: true },
      });
      if (profile) {
        workingUser = {
          ...workingUser,
          effectiveRole: "reseller_partner",
          resellerProfileId: saResellerImpersonateId,
          isImpersonating: true,
          impersonationMode: "superadmin_as_reseller",
        };
      }
      // If profile is missing, silently strip and continue as plain superadmin.
    }

    // Step 2: restaurant-level impersonation.
    // A real superadmin (role === "superadmin") uses sa_impersonate. This
    // includes the SA→reseller chain since their role stays superadmin.
    // A real reseller (role === "reseller_partner") uses partner_impersonate.
    if (workingUser.role === "superadmin" && saImpersonateId) {
      return {
        ...workingUser,
        restaurantId: saImpersonateId,
        isImpersonating: true,
        // Preserve "superadmin_as_reseller" if the SA was already in that mode;
        // otherwise this is a plain SA→restaurant impersonation.
        impersonationMode: workingUser.impersonationMode ?? "superadmin",
      };
    }
    // Reseller→restaurant. Real resellers use partner_impersonate; an SA in
    // SA→reseller mode can also drill into one of the impersonated reseller's
    // restaurants via the same cookie (their effectiveRole is reseller_partner
    // and resellerCanImpersonate validates against the swapped resellerProfileId).
    if (
      (workingUser.role === "reseller_partner" ||
        workingUser.impersonationMode === "superadmin_as_reseller") &&
      partnerImpersonateId
    ) {
      const allowed = await resellerCanImpersonate(workingUser.resellerProfileId, partnerImpersonateId);
      if (allowed) {
        return {
          ...workingUser,
          restaurantId: partnerImpersonateId,
          isImpersonating: true,
          // Preserve SA→reseller mode if applicable; otherwise plain reseller.
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

  // Pick the resolved user. PRIMARY wins if it exists, period.
  //
  // The previous logic tried to be clever and pick whichever session
  // had a `restaurantId`. That broke superadmins catastrophically: a
  // superadmin admin session has restaurantId=null (correct — they own
  // no restaurant), so if the same browser ALSO had a stale kitchen
  // session from earlier /kitchen testing (which always has a
  // restaurantId), the fallback would WIN and Luigi would be silently
  // downgraded to role="kitchen_staff" on /superadmin/* pages. That
  // caused the recurring "click Add-Ons, get logged out" bug AND the
  // "click a restaurant from the list, end up at /superadmin
  // dashboard" bug (the detail page redirected to /admin because
  // role !== superadmin, then the proxy bounced /admin → /superadmin).
  //
  // Right rule: the caller's PREFERRED session wins. The kitchen
  // session (or admin session, with preferKitchen=true) is purely
  // a fallback for when the preferred one is absent. Having a
  // restaurantId is NOT a tiebreaker — it just means the user has
  // a restaurant context, which is irrelevant to choosing which
  // session to authenticate WITH.
  const chosen = primary ?? fallback ?? null;

  // Active-location swap. Only applies to a non-impersonating restaurant_admin
  // who owns the parent and is switching to one of its sibling locations.
  // (Impersonators already targeted a specific restaurant — don't re-swap.)
  if (
    chosen &&
    !chosen.isImpersonating &&
    chosen.effectiveRole === "restaurant_admin" &&
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
