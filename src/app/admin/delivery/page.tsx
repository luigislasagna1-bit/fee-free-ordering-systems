import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { getPlatformGoogleKey } from "@/lib/platform-maps";
import { isInheriting } from "@/lib/inherited-settings";
import { BrandManagedBanner } from "@/components/admin/BrandManagedBanner";
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
      select: { lat: true, lng: true, address: true, city: true, state: true, zip: true, name: true, mapProvider: true, googleMapsApiKey: true, acceptOutsideZoneOrders: true, deliveryAddressConfig: true, parentRestaurantId: true, inheritedSettings: true },
    }),
  ]);

  // Always the platform Google key — the only maps key (Luigi 2026-07-04); any
  // legacy restaurant-own key is ignored so the zone map runs on platform billing.
  if (restaurant) {
    restaurant.googleMapsApiKey = (await getPlatformGoogleKey()) || null;
  }

  // Child inheriting its delivery zones from the brand → editor is read-only.
  const inherited = !!restaurant && isInheriting(restaurant as any, "zones");

  return (
    <>
      {inherited && <BrandManagedBanner />}
      <div
        className={inherited ? "pointer-events-none opacity-60 select-none" : undefined}
        aria-disabled={inherited || undefined}
      >
        <DeliveryClient zones={zones as any} restaurant={restaurant as any} />
      </div>
    </>
  );
}
