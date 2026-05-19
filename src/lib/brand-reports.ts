/**
 * Cross-location aggregations for the brand-level Reports dashboard.
 *
 * Every function fans out one query per location (Promise.all) rather than
 * one giant cross-restaurant query. This is intentional:
 *   1. Per-location queries hit the existing index on Order.restaurantId
 *      directly — fast even with 50+ locations.
 *   2. Keeps individual queries small + easy to reason about; we get the
 *      same shape back as the per-location reports page so downstream
 *      formatting is shared.
 *   3. Cancelling/rejecting one slow location's query (Promise.allSettled
 *      could be swapped in) wouldn't block the rest — future hardening.
 */

import prisma from "@/lib/db";

export type LocationReportRow = {
  restaurantId: string;
  name: string;
  slug: string;
  city: string | null;
  orderCount: number;
  completedCount: number;
  revenue: number;
  averageOrder: number;
};

export type BrandReportPayload = {
  brandId: string;
  brandName: string;
  rangeStart: Date;
  rangeEnd: Date;
  totals: {
    locations: number;
    orderCount: number;
    completedCount: number;
    revenue: number;
    averageOrder: number;
  };
  perLocation: LocationReportRow[];
  /** Top items chain-wide by quantity sold. */
  topItems: Array<{ name: string; quantity: number; revenue: number }>;
  /** Daily totals for the last 7 days inside the range — for trend chart. */
  daily: Array<{ date: string; orderCount: number; revenue: number }>;
};

/**
 * Build the brand reports payload for `parentId`. Window defaults to last
 * 30 days. Excludes rejected/cancelled orders from revenue calculations
 * (they would skew "performance" stats negatively for restaurants that
 * just rejected a dupe order).
 */
export async function loadBrandReports(parentId: string, days = 30): Promise<BrandReportPayload | null> {
  const parent = await prisma.restaurant.findUnique({
    where: { id: parentId },
    select: { id: true, name: true, slug: true, city: true },
  });
  if (!parent) return null;

  const children = await prisma.restaurant.findMany({
    where: { parentRestaurantId: parentId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, slug: true, city: true },
  });

  const allLocations = [parent, ...children];
  const allRestaurantIds = allLocations.map((l) => l.id);

  const rangeEnd = new Date();
  const rangeStart = new Date();
  rangeStart.setDate(rangeStart.getDate() - days);

  // Per-location stats — fan out (cheap because of restaurantId index)
  const perLocation: LocationReportRow[] = await Promise.all(
    allLocations.map(async (loc) => {
      const [allCount, completed, revenueAgg] = await Promise.all([
        prisma.order.count({
          where: {
            restaurantId: loc.id,
            createdAt: { gte: rangeStart },
            status: { not: "rejected" },
          },
        }),
        prisma.order.count({
          where: {
            restaurantId: loc.id,
            createdAt: { gte: rangeStart },
            status: "completed",
          },
        }),
        prisma.order.aggregate({
          where: {
            restaurantId: loc.id,
            createdAt: { gte: rangeStart },
            status: "completed",
          },
          _sum: { total: true },
        }),
      ]);
      const revenue = revenueAgg._sum.total ?? 0;
      return {
        restaurantId: loc.id,
        name: loc.name,
        slug: loc.slug,
        city: loc.city,
        orderCount: allCount,
        completedCount: completed,
        revenue,
        averageOrder: completed > 0 ? revenue / completed : 0,
      };
    }),
  );

  // Brand totals are just summed columns from perLocation — no extra query.
  const sumOrders = perLocation.reduce((s, r) => s + r.orderCount, 0);
  const sumCompleted = perLocation.reduce((s, r) => s + r.completedCount, 0);
  const sumRevenue = perLocation.reduce((s, r) => s + r.revenue, 0);

  // Top items chain-wide — one query across all locations using the
  // restaurantId IN list. groupBy reduces to a small result set.
  const topItemsRaw = await prisma.orderItem.groupBy({
    by: ["name"],
    where: {
      order: {
        restaurantId: { in: allRestaurantIds },
        createdAt: { gte: rangeStart },
        status: { not: "rejected" },
      },
    },
    _sum: { quantity: true, subtotal: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 10,
  });
  const topItems = topItemsRaw.map((row) => ({
    name: row.name,
    quantity: row._sum.quantity ?? 0,
    revenue: row._sum.subtotal ?? 0,
  }));

  // Daily trend for the last 7 days of the range (always 7 buckets even if
  // days > 7). Built in JS from the order list because Prisma doesn't have
  // a clean date-bucket primitive cross-DB.
  const trendStart = new Date();
  trendStart.setDate(trendStart.getDate() - 6);
  trendStart.setHours(0, 0, 0, 0);
  const trendOrders = await prisma.order.findMany({
    where: {
      restaurantId: { in: allRestaurantIds },
      createdAt: { gte: trendStart },
      status: "completed",
    },
    select: { createdAt: true, total: true },
  });
  const dailyBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(trendStart);
    d.setDate(trendStart.getDate() + i);
    return d;
  });
  const daily = dailyBuckets.map((d) => {
    const next = new Date(d);
    next.setDate(d.getDate() + 1);
    const inDay = trendOrders.filter((o) => o.createdAt >= d && o.createdAt < next);
    return {
      date: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      orderCount: inDay.length,
      revenue: inDay.reduce((s, o) => s + o.total, 0),
    };
  });

  return {
    brandId: parent.id,
    brandName: parent.name,
    rangeStart,
    rangeEnd,
    totals: {
      locations: allLocations.length,
      orderCount: sumOrders,
      completedCount: sumCompleted,
      revenue: sumRevenue,
      averageOrder: sumCompleted > 0 ? sumRevenue / sumCompleted : 0,
    },
    perLocation,
    topItems,
    daily,
  };
}
