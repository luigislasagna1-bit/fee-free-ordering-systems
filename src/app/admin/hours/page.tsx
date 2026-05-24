import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { HoursClient } from "./HoursClient";

export default async function HoursPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) {
    return <HoursClient hours={[]} hoursFormat="24h" holidays={[]} />;
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
      select: { hoursFormat: true },
    }),
    prisma.restaurantHoliday.findMany({
      where: { restaurantId, date: { gte: todayStart } },
      orderBy: { date: "asc" },
    }),
  ]);

  return (
    <HoursClient
      hours={hours as any}
      hoursFormat={(restaurant?.hoursFormat as "12h" | "24h") || "24h"}
      holidays={holidays.map((h) => ({
        id: h.id,
        // Send ISO date string to the client to avoid timezone smear
        // — the holiday-add UI also speaks YYYY-MM-DD throughout.
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
      }))}
    />
  );
}
