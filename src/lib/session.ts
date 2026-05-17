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
  /** "superadmin" | "reseller" | null. Distinguishes which kind of impersonation is active. */
  impersonationMode: "superadmin" | "reseller" | null;
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

  // Build the candidate users without impersonation first.
  const adminUserBase = baseFromSession(adminSession);
  const kitchenUserBase = baseFromSession(kitchenSession);

  // Apply impersonation cookie to whichever candidate is the right role.
  // Superadmin sa_impersonate takes precedence if both cookies happen to be
  // set on a superadmin account (edge case during testing).
  async function applyImpersonation(user: SessionUser | null): Promise<SessionUser | null> {
    if (!user) return null;
    if (user.role === "superadmin" && saImpersonateId) {
      return {
        ...user,
        restaurantId: saImpersonateId,
        isImpersonating: true,
        impersonationMode: "superadmin",
      };
    }
    if (user.role === "reseller_partner" && partnerImpersonateId) {
      const allowed = await resellerCanImpersonate(user.resellerProfileId, partnerImpersonateId);
      if (allowed) {
        return {
          ...user,
          restaurantId: partnerImpersonateId,
          isImpersonating: true,
          impersonationMode: "reseller",
        };
      }
      // Cookie present but no longer valid (restaurant reassigned, reseller
      // suspended, etc.). Strip it silently — caller will see no restaurantId.
    }
    return user;
  }

  const [adminUser, kitchenUser] = await Promise.all([
    applyImpersonation(adminUserBase),
    applyImpersonation(kitchenUserBase),
  ]);

  const primary  = opts?.preferKitchen ? kitchenUser : adminUser;
  const fallback = opts?.preferKitchen ? adminUser  : kitchenUser;

  if (primary && primary.restaurantId) return primary;
  if (fallback && fallback.restaurantId) return fallback;

  return primary ?? fallback ?? null;
}
