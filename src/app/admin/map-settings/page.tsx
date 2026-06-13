import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getPlatformGoogleKey } from "@/lib/platform-maps";
import { MapSettingsClient } from "./MapSettingsClient";

export default async function MapSettingsPage() {
  const user = await getSessionUser();
  // See add-ons/page.tsx for the rationale.
  if (!user) redirect("/login");
  if (!user.restaurantId) redirect("/superadmin");
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { mapProvider: true, googleMapsApiKey: true },
  });
  // When the PLATFORM has a Google Maps key (set in Superadmin → Maps Settings,
  // stored in PlatformSettings), every restaurant gets Google with zero setup —
  // so the page must stop telling them to make their own Google Cloud project
  // (Luigi 2026-06-13). Their own key becomes an optional override.
  const platformKeyConfigured = !!(await getPlatformGoogleKey());
  return (
    <MapSettingsClient
      platformKeyConfigured={platformKeyConfigured}
      initial={{
        mapProvider: (restaurant?.mapProvider ?? "leaflet") as "leaflet" | "google",
        googleMapsApiKey: restaurant?.googleMapsApiKey ?? "",
      }}
    />
  );
}
