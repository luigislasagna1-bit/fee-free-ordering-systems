import "server-only";
import prisma from "@/lib/db";
import { isInheriting, type InheritanceShape } from "@/lib/inherited-settings";

/**
 * LIVE-inheritance data resolution (Phase 3 of Luigi's multi-location spec).
 *
 * When a CHILD location inherits a setting, the read paths must use the BRAND
 * parent's CURRENT rows instead of the child's own. These helpers take the
 * restaurant with its OWN already-loaded rows and swap in the parent's only when
 * inheriting — so a non-child / non-inheriting restaurant costs no extra query
 * (the common case). Menu is handled separately via useBrandMenu + brand.ts.
 *
 * Keep every read site that enforces hours/zones consistent: the customer page
 * (display + scheduling) and the order API (closed + zone validation) must agree,
 * or a child could be shown the brand's hours but validated against its own.
 */
type Base = InheritanceShape & { parentRestaurantId: string | null };

/** Opening hours: the brand's when the child inherits "hours", else its own. */
export async function resolveInheritedHours<T>(r: Base & { openingHours: T[] }): Promise<T[]> {
  if (!r.parentRestaurantId || !isInheriting(r, "hours")) return r.openingHours;
  const rows = await prisma.openingHours.findMany({
    where: { restaurantId: r.parentRestaurantId },
    orderBy: { dayOfWeek: "asc" },
  });
  return rows as unknown as T[];
}

/** Active delivery zones: the brand's when the child inherits "zones", else its own. */
export async function resolveInheritedZones<T>(r: Base & { deliveryZones: T[] }): Promise<T[]> {
  if (!r.parentRestaurantId || !isInheriting(r, "zones")) return r.deliveryZones;
  const rows = await prisma.deliveryZone.findMany({
    where: { restaurantId: r.parentRestaurantId, isActive: true },
    orderBy: [{ radiusKm: "asc" }, { sortOrder: "asc" }],
  });
  return rows as unknown as T[];
}
