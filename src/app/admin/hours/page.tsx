import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { HoursClient } from "./HoursClient";

export default async function HoursPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const hours = restaurantId
    ? await prisma.openingHours.findMany({
        where: { restaurantId },
        orderBy: { dayOfWeek: "asc" },
      })
    : [];
  return <HoursClient hours={hours as any} />;
}
