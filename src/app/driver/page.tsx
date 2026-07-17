import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getDriverSession } from "@/lib/driver-session";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { DriverQueue } from "./DriverQueue";
import { RestaurantDispatch } from "./RestaurantDispatch";

export const dynamic = "force-dynamic";

/**
 * The Fee Free Delivery app is one URL (/driver) that serves two roles off two
 * independent session cookies:
 *   • a DRIVER session  → the job queue (accept / pick up / deliver).
 *   • an admin session with a restaurantId → the restaurant DISPATCH view
 *     (assign & track deliveries), reusing the admin ops panel.
 *
 * ffd-role-pref (v1.1 Phase 0) — a RENDERING PREFERENCE cookie, never an authz
 * input (a CI grep gate keeps it out of src/app/api): on dual-session devices
 * (an owner who also drives, or a shared tablet) it decides which shell renders;
 * with a single session it changes nothing. Unset keeps today's behavior:
 * the driver session wins if both are present (this is the drivers' app first).
 * No restaurantId tie-breaking, ever (see AGENTS.md session rule) — a superadmin
 * (no restaurantId) is sent to the drivers roster.
 */
export default async function DriverHomePage() {
  const pref = (await cookies()).get("ffd-role-pref")?.value;

  const driver = await getDriverSession();
  // Dual-role tie-break: only a driver session + an explicit restaurant
  // preference looks at the admin session first. Everything else keeps the
  // driver-first behavior verbatim.
  if (driver && pref !== "restaurant") {
    const rec = await prisma.driver.findUnique({ where: { id: driver.driverId }, select: { ratingPct: true } });
    return <DriverQueue driverName={driver.name} rating={rec?.ratingPct ?? null} />;
  }

  const user = await getSessionUser();
  if (user) {
    if (!user.restaurantId) redirect("/superadmin/drivers");
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: user.restaurantId },
      select: { name: true },
    });
    return <RestaurantDispatch restaurantId={user.restaurantId} restaurantName={restaurant?.name ?? ""} />;
  }

  // pref said "restaurant" but there is no admin session — fall back to the
  // driver session rather than bouncing a signed-in driver to the login page.
  if (driver) {
    const rec = await prisma.driver.findUnique({ where: { id: driver.driverId }, select: { ratingPct: true } });
    return <DriverQueue driverName={driver.name} rating={rec?.ratingPct ?? null} />;
  }

  redirect("/driver/login");
}
