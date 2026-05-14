import { notFound } from "next/navigation";
import prisma from "@/lib/db";
import { RestaurantInfoClient } from "./RestaurantInfoClient";

export default async function RestaurantInfoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: {
      slug: true, name: true, slogan: true, description: true,
      phone: true, email: true, address: true, city: true, state: true, zip: true,
      lat: true, lng: true,
      mapProvider: true, googleMapsApiKey: true,
      logoUrl: true, bannerUrl: true,
      acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
      acceptsCatering: true, acceptsTakeOut: true, acceptsReservations: true,
      estimatedPickup: true, estimatedDelivery: true,
      reviewLink: true, infoContent: true,
      themeSettings: true, serviceSettings: true,
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      deliveryZones: {
        where: { isActive: true },
        orderBy: [{ radiusKm: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!restaurant) notFound();

  return <RestaurantInfoClient restaurant={restaurant as any} />;
}
