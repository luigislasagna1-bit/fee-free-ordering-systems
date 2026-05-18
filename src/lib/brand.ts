/**
 * Brand-aware helpers for multi-location restaurants.
 *
 * A "brand" is a parent Restaurant that has at least one child (Restaurant
 * with parentRestaurantId pointing at it). Single-location restaurants have
 * no children — their parentRestaurantId is null and no other Restaurant
 * points at them.
 *
 * The brand admin experience: when an owner logs in and is currently focused
 * on the brand parent (no active_location cookie pointing at a child), they
 * see the chain-wide BrandDashboard at /admin instead of the single-location
 * dashboard. Drilling into a child via the LocationSwitcher takes them to
 * that child's normal admin.
 */

import prisma from "@/lib/db";

export interface BrandSummary {
  id: string;
  name: string;
  slug: string;
  /** Locations in this brand, including the parent itself first. */
  locations: BrandLocation[];
}

export interface BrandLocation {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  isParent: boolean;
  isPublished: boolean;
  /** Quick stats used on the brand dashboard tiles. */
  stats: {
    pendingOrders: number;
    totalOrdersToday: number;
    revenueToday: number;
  };
}

/**
 * True when this restaurantId is the BRAND PARENT of at least one location.
 * That is: it has zero parentRestaurantId AND at least one Restaurant points
 * at it via parentRestaurantId. The brand dashboard is shown only in this
 * case.
 */
export async function isBrandParent(restaurantId: string): Promise<boolean> {
  const childCount = await prisma.restaurant.count({
    where: { parentRestaurantId: restaurantId },
  });
  return childCount > 0;
}

/**
 * Returns the brand summary for the parent restaurant, plus quick stats for
 * each location tile on the dashboard.
 *
 * Stats are intentionally cheap — counts + sums for "today" only. Real
 * cross-location reports come later in Phase 2.
 */
export async function loadBrandSummary(parentId: string): Promise<BrandSummary | null> {
  const parent = await prisma.restaurant.findUnique({
    where: { id: parentId },
    select: { id: true, name: true, slug: true, city: true, publishedAt: true },
  });
  if (!parent) return null;

  const children = await prisma.restaurant.findMany({
    where: { parentRestaurantId: parentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, city: true, publishedAt: true },
  });

  // Compute "today" as UTC start-of-day. Per-location restaurant timezones
  // could make this fancier later, but UTC is fine for a dashboard tile.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const allLocations = [parent, ...children];
  const locationsWithStats: BrandLocation[] = await Promise.all(
    allLocations.map(async (loc) => {
      const [pending, todayStats] = await Promise.all([
        prisma.order.count({
          where: { restaurantId: loc.id, status: "pending" },
        }),
        prisma.order.aggregate({
          where: {
            restaurantId: loc.id,
            createdAt: { gte: today },
          },
          _count: true,
          _sum: { total: true },
        }),
      ]);
      return {
        id: loc.id,
        name: loc.name,
        slug: loc.slug,
        city: loc.city,
        isParent: loc.id === parent.id,
        isPublished: !!loc.publishedAt,
        stats: {
          pendingOrders: pending,
          totalOrdersToday: todayStats._count,
          revenueToday: todayStats._sum.total ?? 0,
        },
      };
    })
  );

  return {
    id: parent.id,
    name: parent.name,
    slug: parent.slug,
    locations: locationsWithStats,
  };
}
