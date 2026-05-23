"use client";

/**
 * Client-side wrapper that lazy-loads the shared DeliveryZonesMap
 * component (the one /order/[slug]/info also uses). The hosted site's
 * /site/[slug] page is a server component; ssr:false on next/dynamic
 * only works inside a client component, so we have this tiny shim to
 * cross the boundary.
 *
 * Re-exports the same prop API as @/app/order/[slug]/DeliveryZonesMap
 * for drop-in use from server components.
 */

import dynamic from "next/dynamic";

const DeliveryZonesMap = dynamic(
  () => import("../../order/[slug]/DeliveryZonesMap"),
  { ssr: false, loading: () => <div className="h-72 md:h-[420px] w-full rounded-xl bg-gray-100 animate-pulse" /> },
);

export type HostedDeliveryZone = {
  id: string;
  name: string;
  color: string;
  radiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  isActive: boolean;
};

export function HostedDeliveryZonesMap({
  restaurantLat,
  restaurantLng,
  zones,
  provider,
  googleMapsApiKey,
}: {
  restaurantLat: number;
  restaurantLng: number;
  zones: HostedDeliveryZone[];
  provider: "leaflet" | "google";
  googleMapsApiKey?: string;
}) {
  return (
    <DeliveryZonesMap
      restaurantLat={restaurantLat}
      restaurantLng={restaurantLng}
      zones={zones}
      provider={provider}
      googleMapsApiKey={googleMapsApiKey}
    />
  );
}
