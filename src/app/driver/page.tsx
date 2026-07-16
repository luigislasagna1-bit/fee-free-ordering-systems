import { redirect } from "next/navigation";
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
 * The driver session wins if both are present (this is the drivers' app first).
 * A signed-in superadmin (no restaurantId) is sent to the drivers roster.
 */
export default async function DriverHomePage() {
  const driver = await getDriverSession();
  if (driver) {
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

  redirect("/driver/login");
}
