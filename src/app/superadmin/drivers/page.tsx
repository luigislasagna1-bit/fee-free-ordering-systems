import "server-only";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { DriversClient } from "./DriversClient";

/**
 * Superadmin FeeFreeDelivery driver pool — create/manage the in-house drivers
 * that restaurants dispatch to. Platform-level (drivers serve multiple stores),
 * so it lives under /superadmin, not a single restaurant's admin. Full
 * superadmin only.
 */
export const dynamic = "force-dynamic";

export default async function SuperadminDriversPage() {
  const actor = await requireSuperadmin();
  if (!actor) redirect("/superadmin");

  const [drivers, restaurants] = await Promise.all([
    prisma.driver.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, email: true, phone: true, isActive: true,
        hourlyRateCents: true, homeRestaurantId: true, ratingAvg: true, ratingCount: true,
        lastLocationAt: true, lastLat: true, lastLng: true, createdAt: true,
        homeRestaurant: { select: { name: true } },
        _count: { select: { assignments: { where: { status: { notIn: ["delivered", "failed", "returned", "cancelled"] } } } } },
      },
    }),
    prisma.restaurant.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
  ]);

  // Where drivers sign in — the standalone /driver PWA (nothing else links to it).
  const driverAppUrl = `${(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/$/, "")}/driver`;

  return (
    <DriversClient
      driverAppUrl={driverAppUrl}
      initialDrivers={drivers.map((d) => ({
        id: d.id, name: d.name, email: d.email, phone: d.phone, isActive: d.isActive,
        hourlyRateCents: d.hourlyRateCents, homeRestaurantId: d.homeRestaurantId,
        homeRestaurantName: d.homeRestaurant?.name ?? null,
        ratingAvg: d.ratingAvg, ratingCount: d.ratingCount,
        activeJobs: d._count.assignments,
        hasLocation: d.lastLat != null && d.lastLng != null,
        lastLocationAt: d.lastLocationAt ? d.lastLocationAt.toISOString() : null,
        createdAt: d.createdAt.toISOString(),
      }))}
      restaurants={restaurants}
    />
  );
}
