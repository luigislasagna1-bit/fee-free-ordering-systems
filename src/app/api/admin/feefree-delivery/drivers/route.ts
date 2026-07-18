import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/feefree-delivery/drivers
 *
 * The restaurant-shell Drivers tab (v1.1 Phase 8, plan §4.4): every driver
 * who has DELIVERED for this restaurant, plus this restaurant's home-store
 * drivers (even with zero deliveries yet — they're the ones the owner
 * invited, so hiding them until their first run would read as a bug).
 *
 * Auth: getSessionUser() → restaurantId ALWAYS from the session (AGENTS.md).
 *
 * Exactly 3 queries, no N+1 (plan §4.4):
 *   1. groupBy delivered assignments by driverId → count + last delivered
 *   2. one Driver findMany over (delivered-for-you ∪ home-store) ids
 *   3. groupBy THIS restaurant's own DriverFeedback → "your rating" line
 *
 * Driver.phone IS returned — Luigi's 2026-07-16 decision: restaurants see
 * their drivers' phone numbers (tap-to-call). Never exposed on any
 * customer-facing surface.
 *
 * Scale: a restaurant's distinct-driver cardinality is naturally small
 * (tens). Both driver lookups are capped and the response is capped at
 * MAX_DRIVERS, so a pathological pool can't produce an unbounded payload.
 * groupBy(1) walks delivered rows via the [restaurantId, completedAt]
 * index prefix today; the pending [restaurantId, status, deliveredAt]
 * index (OWNER-ACTIONS A21) tightens it to an exact probe.
 */

const MAX_DRIVERS = 100;
/** Defensive cap on the raw Driver fetch (ids ∪ home-store) before merge. */
const MAX_FETCH = 200;

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  // Role gate: getSessionUser() FALLS BACK to the kitchen session (path=/
  // cookie), and a kitchen login is designed not to grant the dispatch
  // surface. Gate on `role` — NOT effectiveRole — so impersonating
  // superadmins/resellers still pass (session.ts).
  if (!restaurantId || user?.role === "kitchen_staff") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Delivered-for-you rollup: one groupBy, no per-driver queries.
  const delivered = await prisma.deliveryAssignment.groupBy({
    by: ["driverId"],
    where: { restaurantId, status: "delivered", driverId: { not: null } },
    _count: { _all: true },
    _max: { completedAt: true },
  });

  const deliveredByDriver = new Map(
    delivered
      .filter((g): g is typeof g & { driverId: string } => g.driverId !== null)
      .map((g) => [
        g.driverId,
        {
          count: g._count._all,
          lastDeliveredAt: g._max.completedAt,
        },
      ]),
  );

  // 2. One Driver fetch covering both populations. Prisma turns the OR into
  // a single indexed query (id IN (...) OR homeRestaurantId = ?).
  const drivers = await prisma.driver.findMany({
    where: {
      OR: [
        { id: { in: [...deliveredByDriver.keys()] } },
        { homeRestaurantId: restaurantId },
      ],
    },
    select: {
      id: true,
      name: true,
      phone: true,
      ratingPct: true,
      isActive: true,
      homeRestaurantId: true,
    },
    take: MAX_FETCH,
  });

  // 3. "Your rating" rollup — only THIS restaurant's own restaurant-source
  // feedback (never platform/customer rows, never other restaurants').
  const myFeedback = await prisma.driverFeedback.groupBy({
    by: ["driverId"],
    where: {
      restaurantId,
      source: "restaurant",
      driverId: { in: drivers.map((d) => d.id) },
    },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const myFeedbackByDriver = new Map(
    myFeedback.map((g) => [
      g.driverId,
      { avg: g._avg.stars ?? 0, count: g._count._all },
    ]),
  );

  const merged = drivers
    .map((d) => {
      const del = deliveredByDriver.get(d.id);
      const mine = myFeedbackByDriver.get(d.id);
      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        ratingPct: d.ratingPct,
        isActive: d.isActive,
        isHomeStore: d.homeRestaurantId === restaurantId,
        deliveriesForYou: del?.count ?? 0,
        lastDeliveredAt: del?.lastDeliveredAt?.toISOString() ?? null,
        myRating: mine ? { avg: mine.avg, count: mine.count } : null,
      };
    })
    // Most deliveries for you first; ties broken by recency, then name so
    // the order is stable across refreshes.
    .sort(
      (a, b) =>
        b.deliveriesForYou - a.deliveriesForYou ||
        (b.lastDeliveredAt ?? "").localeCompare(a.lastDeliveredAt ?? "") ||
        a.name.localeCompare(b.name),
    )
    .slice(0, MAX_DRIVERS);

  return NextResponse.json({ drivers: merged });
}
