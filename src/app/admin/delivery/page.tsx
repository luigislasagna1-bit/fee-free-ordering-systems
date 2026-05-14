import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { DeliveryClient } from "./DeliveryClient";

export default async function DeliveryPage() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  const [zones, restaurant] = await Promise.all([
    prisma.deliveryZone.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId ?? "" },
      select: { lat: true, lng: true, address: true, city: true, state: true, zip: true, name: true, mapProvider: true, googleMapsApiKey: true },
    }),
  ]);

  return <DeliveryClient zones={zones as any} restaurant={restaurant as any} />;
}
