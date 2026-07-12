/**
 * Canonical role literals. User.role in the database is a free-form string —
 * import the constants from this module rather than typing strings inline so
 * we never end up with "superdamin" or "reseller" vs "reseller_partner" drift.
 *
 * Roles:
 *   superadmin        — platform operator. Can do anything.
 *   platform_support  — platform TEAM member with restricted powers (Team
 *                       feature, Luigi 2026-07-12): sees the /superadmin area
 *                       read-mostly (restaurants, resellers, reports) but can
 *                       NOT touch platform secrets (Stripe/email/maps keys),
 *                       plans/add-on pricing, payouts, impersonation, or the
 *                       team itself. Gate mutations with requireSuperadmin(),
 *                       reads with requirePlatformStaff() (platform-auth.ts).
 *   reseller_partner  — approved reseller who manages a set of restaurants
 *                       and earns commission on their subscription revenue.
 *   pending_reseller  — has applied via /partners/apply, awaiting approval.
 *                       Can log in but only sees the holding page.
 *   restaurant_admin  — owner / manager of a single restaurant.
 *   kitchen_staff     — uses the kitchen display terminal.
 */
export const ROLES = {
  SUPERADMIN: "superadmin",
  PLATFORM_SUPPORT: "platform_support",
  RESELLER_PARTNER: "reseller_partner",
  PENDING_RESELLER: "pending_reseller",
  RESTAURANT_ADMIN: "restaurant_admin",
  KITCHEN_STAFF: "kitchen_staff",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES: Role[] = Object.values(ROLES);

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ALL_ROLES as string[]).includes(value);
}

export function isSuperadmin(role: string | null | undefined): boolean {
  return role === ROLES.SUPERADMIN;
}

/** Platform STAFF = full superadmin OR restricted platform_support. Gates the
 *  /superadmin AREA and its read endpoints; mutations/secrets stay behind
 *  isSuperadmin. See src/lib/platform-auth.ts for the request-level guards. */
export function isPlatformStaff(role: string | null | undefined): boolean {
  return role === ROLES.SUPERADMIN || role === ROLES.PLATFORM_SUPPORT;
}

export function isResellerPartner(role: string | null | undefined): boolean {
  return role === ROLES.RESELLER_PARTNER;
}

export function isPendingReseller(role: string | null | undefined): boolean {
  return role === ROLES.PENDING_RESELLER;
}

/** True for either pending or approved reseller — useful when checking
 *  whether the user has *any* reseller context (e.g. for the application
 *  status page). */
export function isAnyReseller(role: string | null | undefined): boolean {
  return isResellerPartner(role) || isPendingReseller(role);
}

export function isRestaurantAdmin(role: string | null | undefined): boolean {
  return role === ROLES.RESTAURANT_ADMIN;
}

export function isKitchenStaff(role: string | null | undefined): boolean {
  return role === ROLES.KITCHEN_STAFF;
}

/**
 * Per-restaurant access levels stored on RestaurantAccess.accessRole. Distinct
 * from User.role (which is the user's *system* role). A reseller_partner user
 * may hold "reseller_manager" access on multiple restaurants; a restaurant_admin
 * user holds "owner" implicitly (via User.restaurantId) plus possibly "manager"
 * grants on other restaurants.
 */
export const ACCESS_ROLES = {
  OWNER: "owner",
  RESELLER_MANAGER: "reseller_manager",
  MANAGER: "manager",
  STAFF: "staff",
  READONLY: "readonly",
} as const;

export type AccessRole = (typeof ACCESS_ROLES)[keyof typeof ACCESS_ROLES];

export const ACCESS_ROLE_ORDER: AccessRole[] = [
  ACCESS_ROLES.READONLY,
  ACCESS_ROLES.STAFF,
  ACCESS_ROLES.MANAGER,
  ACCESS_ROLES.RESELLER_MANAGER,
  ACCESS_ROLES.OWNER,
];

/** Returns true if `actual` is at or above `required` in the access-role
 *  hierarchy. Use for write-gated endpoints: `accessRoleAtLeast(grant, "manager")`. */
export function accessRoleAtLeast(actual: string | null | undefined, required: AccessRole): boolean {
  if (!actual) return false;
  const a = ACCESS_ROLE_ORDER.indexOf(actual as AccessRole);
  const r = ACCESS_ROLE_ORDER.indexOf(required);
  return a >= 0 && r >= 0 && a >= r;
}
