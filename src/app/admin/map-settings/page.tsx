import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { MapSettingsClient } from "./MapSettingsClient";

export default async function MapSettingsPage() {
  const user = await getSessionUser();
  if (!user?.restaurantId) redirect("/login");
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { mapProvider: true, googleMapsApiKey: true },
  });
  return (
    <MapSettingsClient
      initial={{
        mapProvider: (restaurant?.mapProvider ?? "leaflet") as "leaflet" | "google",
        googleMapsApiKey: restaurant?.googleMapsApiKey ?? "",
      }}
    />
  );
}
