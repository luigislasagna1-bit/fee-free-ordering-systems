import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { getDriverSession } from "@/lib/driver-session";
import { getSessionUser } from "@/lib/session";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { DriverApp } from "./DriverApp";
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
    // hasOtherRole feeds RoleSwitch ONLY (does the switch flip in-app or
    // deep-link the login?). It is never a tie-break input — the driver
    // session already won this branch per the truth table above.
    //
    // It must mean "an ADMIN session is also present" (plan §2.3's truth
    // table + the RoleSwitch prop contract), so read the admin session
    // directly. A bare getSessionUser() would FALL BACK to the kitchen
    // session (session.ts: primary=admin, fallback=kitchen; the kitchen
    // cookie is path=/ so it rides along on /driver) — and a kitchen-staff
    // login on a shared tablet would then advertise "Switch to restaurant
    // view", one-tap-setting the sticky ffd-role-pref and pinning the tablet
    // on the dispatch surface a kitchen login is designed not to grant
    // (admin/layout.tsx bounces kitchen_staff for the same reason). With no
    // admin session, the switch deep-links /driver/login?as=restaurant and
    // real admin credentials are required. Read-only presence check —
    // session.ts itself stays untouched (plan §8).
    const [rec, adminSession] = await Promise.all([
      prisma.driver.findUnique({ where: { id: driver.driverId }, select: { ratingPct: true } }),
      getServerSession(authOptions),
    ]);
    return <DriverApp driverName={driver.name} rating={rec?.ratingPct ?? null} hasOtherRole={!!adminSession?.user} />;
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
  // (getSessionUser() returned null above, which implies the admin session is
  // absent too, so hasOtherRole is false.)
  if (driver) {
    const rec = await prisma.driver.findUnique({ where: { id: driver.driverId }, select: { ratingPct: true } });
    return <DriverApp driverName={driver.name} rating={rec?.ratingPct ?? null} hasOtherRole={false} />;
  }

  redirect("/driver/login");
}
