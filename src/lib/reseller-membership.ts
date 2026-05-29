/**
 * Reseller-scope membership check.
 *
 * Used by the branded-login enforcement on reseller generic + custom
 * domains: only users who belong to a given reseller can authenticate
 * on that reseller's branded sign-in page. Everyone else gets a clear
 * "sign in at feefreeordering.com" message.
 *
 * A user "belongs to" a reseller when ANY of:
 *
 *   1. They ARE the reseller's own User row
 *      (User.resellerProfileId === resellerProfileId)
 *
 *   2. They're a restaurant_admin / restaurant_owner of a restaurant
 *      that's attached to the reseller
 *      (User.restaurant.resellerProfileId === resellerProfileId)
 *
 *   3. They have staff access (RestaurantAccess) to a restaurant that's
 *      attached to the reseller. Covers kitchen staff, managers, etc.
 *
 *   4. They're a superadmin. Master override so platform operators can
 *      always log in anywhere for support.
 *
 * Returns true on match, false otherwise. Designed to be called from
 * NextAuth's authorize() after credentials validate — gate the return,
 * don't gate the credential check (so we don't reveal whether the email
 * exists to attackers probing a branded URL).
 */

import prisma from "@/lib/db";

export async function userBelongsToReseller(
  userId: string,
  resellerProfileId: string,
): Promise<boolean> {
  // One round-trip — pull just the fields we need: role, owner relation
  // to a ResellerProfile (case 1), and the resellerProfileId of any
  // restaurant the user owns (case 2). RestaurantAccess (case 3) goes
  // in a second targeted query, only if needed.
  //
  // Schema cheat-sheet:
  //   User —— resellerProfile  (1:1 via ResellerProfile.userId)
  //   User —— restaurant       (1:1 via User.restaurantId — owner relation)
  //   Restaurant.resellerProfileId → ResellerProfile.id
  //   RestaurantAccess.userId → User; .restaurantId → Restaurant
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      // The User row "is" a reseller when ResellerProfile.userId points
      // at them. Selecting the id is sufficient for the check.
      resellerProfile: { select: { id: true } },
      // Owner relation — the restaurant the user owns (if any).
      restaurant: { select: { resellerProfileId: true } },
    },
  });
  if (!user) return false;

  // Master override — superadmin can always log in anywhere.
  if (user.role === "superadmin") return true;

  // Case 1: reseller's own User row
  if (user.resellerProfile?.id === resellerProfileId) return true;

  // Case 2: owner / restaurant_admin of a restaurant under this reseller
  if (user.restaurant?.resellerProfileId === resellerProfileId) return true;

  // Case 3: staff access to a restaurant under this reseller.
  // Only ask the DB this question if cases 1 + 2 didn't already pass —
  // most logins won't reach this branch.
  const staffMatch = await prisma.restaurantAccess.findFirst({
    where: {
      userId,
      restaurant: { resellerProfileId },
    },
    select: { id: true },
  });
  return !!staffMatch;
}
