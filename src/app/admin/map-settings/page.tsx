import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
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
  // When the PLATFORM provides a Google Maps browser key (NEXT_PUBLIC_…), every
  // restaurant gets Google with zero setup — so the page must stop telling them
  // to make their own Google Cloud project (Luigi 2026-06-13). Their own key
  // becomes an optional override. Read server-side so the client renders the
  // right copy without exposing anything new.
  const platformKeyConfigured = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
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
