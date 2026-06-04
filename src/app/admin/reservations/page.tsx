import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { ReservationsClient } from "./ReservationsClient";

export default async function ReservationsPage() {
  const user = await getSessionUser();
  const restaurant = user?.restaurantId
    ? await prisma.restaurant.findUnique({
        where: { id: user.restaurantId },
        select: { hoursFormat: true },
      })
    : null;
  const hoursFormat = restaurant?.hoursFormat === "12h" ? "12h" : "24h";
  return <ReservationsClient hoursFormat={hoursFormat} />;
}
