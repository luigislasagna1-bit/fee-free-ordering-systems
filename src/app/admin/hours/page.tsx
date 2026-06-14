import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { isInheriting } from "@/lib/inherited-settings";
import { BrandManagedBanner } from "@/components/admin/BrandManagedBanner";
import { HoursClient } from "./HoursClient";

export default async function HoursPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) {
    return <HoursClient hours={[]} hoursFormat="24h" holidays={[]} offeredServices={[]} />;
  }

  // Three queries in parallel — they're independent, no point serializing.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [hours, restaurant, holidays] = await Promise.all([
    prisma.openingHours.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: "asc" },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        hoursFormat: true,
        // Inheritance state — a child that inherits its hours from the brand
        // sees the editor below read-only.
        parentRestaurantId: true, inheritedSettings: true,
        // Drive the holiday "affected services" chips off the services the
        // restaurant actually offers — no point letting an owner close a
        // service they don't run (Luigi 2026-06-12, report cmpxds2d2).
        acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
        acceptsTakeOut: true, acceptsCatering: true, acceptsReservations: true,
      },
    }),
    prisma.restaurantHoliday.findMany({
      // A PERIOD that started in the past is still active until its endDate —
      // don't hide it from the list just because its start date passed.
      where: { restaurantId, OR: [{ date: { gte: todayStart } }, { endDate: { gte: todayStart } }] },
      orderBy: { date: "asc" },
    }),
  ]);

  // Canonical holiday-rule service keys for the services this restaurant
  // offers (note: dine-in/reservation map to the holiday keys dine_in/
  // reservation). Order preserved to match the chip row.
  const r = restaurant as any;
  const offeredServices = [
    r?.acceptsPickup && "pickup",
    r?.acceptsDelivery && "delivery",
    r?.acceptsDineIn && "dine_in",
    r?.acceptsTakeOut && "take_out",
    r?.acceptsCatering && "catering",
    r?.acceptsReservations && "reservation",
  ].filter(Boolean) as string[];

  // When this child location inherits its opening hours from the brand, the
  // editor is read-only — dim it + show the banner (the save endpoint also
  // refuses the write). Luigi 2026-06-14.
  const inherited = !!restaurant && isInheriting(restaurant as any, "hours");

  return (
    <>
      {inherited && <BrandManagedBanner />}
      <div
        className={inherited ? "pointer-events-none opacity-60 select-none" : undefined}
        aria-disabled={inherited || undefined}
      >
        <HoursClient
          hours={hours as any}
          hoursFormat={(restaurant?.hoursFormat as "12h" | "24h") || "24h"}
          offeredServices={offeredServices}
          holidays={holidays.map((h) => ({
            id: h.id,
            // Send ISO date string to the client to avoid timezone smear
            // — the holiday-add UI also speaks YYYY-MM-DD throughout.
            date: h.date.toISOString().slice(0, 10),
            name: h.name,
            endDate: (h as any).endDate ? (h as any).endDate.toISOString().slice(0, 10) : null,
            message: (h as any).message ?? null,
            rules: (h as any).rules ?? null,
          }))}
        />
      </div>
    </>
  );
}
