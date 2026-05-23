"use client";

/**
 * Interactive delivery-zones map for the hosted site.
 *
 * Uses Leaflet + OpenStreetMap (no Google Maps API key, no per-load cost).
 * Renders the restaurant pin in the center, each active delivery zone as
 * a colored translucent circle, and a legend listing zone name + fee +
 * minimum + ETA. The legend is OUTSIDE the map for accessibility — a
 * screen reader can read the zone info without ever loading the map.
 *
 * Leaflet's CSS + DOM globals require client-side mounting — we dynamic-
 * import to skip SSR. Safe because the map is below-the-fold and the
 * page works without it (the visible legend already conveys the data).
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";

export type ZoneForMap = {
  id: string;
  name: string;
  color: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
};

// react-leaflet has no SSR; lazy-load the entire client subtree.
const LeafletScene = dynamic(() => import("./DeliveryZonesMapScene"), {
  ssr: false,
  loading: () => (
    <div className="h-72 md:h-96 w-full rounded-2xl bg-gray-100 flex items-center justify-center text-sm text-gray-400">
      Loading delivery map…
    </div>
  ),
});

export function DeliveryZonesMap({
  restaurantName,
  restaurantLat,
  restaurantLng,
  zones,
  primaryColor,
}: {
  restaurantName: string;
  restaurantLat: number | null;
  restaurantLng: number | null;
  zones: ZoneForMap[];
  primaryColor: string;
}) {
  // We can render a meaningful map ONLY when we have a restaurant pin
  // AND at least one zone. Otherwise we skip the map and just show the
  // legend (or nothing if there are no zones either).
  const hasPin = restaurantLat != null && restaurantLng != null;
  const hasZones = zones.length > 0;

  // Pick a sensible bounding box around the restaurant + all zones.
  // Used to set the initial Leaflet viewport.
  const center = useMemo<[number, number] | null>(() => {
    if (hasPin) return [restaurantLat!, restaurantLng!];
    if (zones.length > 0) return [zones[0].centerLat, zones[0].centerLng];
    return null;
  }, [hasPin, restaurantLat, restaurantLng, zones]);

  // Crude initial zoom — picks a level that fits the largest zone in view.
  // Real fitBounds calculation lives inside DeliveryZonesMapScene (it has
  // access to the Leaflet map ref). This is just the starting point.
  const initialZoom = useMemo(() => {
    if (zones.length === 0) return 13;
    const biggestRadiusKm = Math.max(...zones.map((z) => z.radiusKm));
    if (biggestRadiusKm > 30) return 9;
    if (biggestRadiusKm > 15) return 10;
    if (biggestRadiusKm > 8) return 11;
    if (biggestRadiusKm > 4) return 12;
    return 13;
  }, [zones]);

  if (!hasZones && !hasPin) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4">
      {/* Map column — full width on mobile, ~1fr on desktop */}
      {center && (
        <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
          <LeafletScene
            center={center}
            initialZoom={initialZoom}
            restaurantName={restaurantName}
            restaurantLat={restaurantLat}
            restaurantLng={restaurantLng}
            zones={zones}
            primaryColor={primaryColor}
          />
        </div>
      )}

      {/* Legend column — always rendered when zones exist. Each row is
          its own card so it's scannable at a glance. */}
      {hasZones && (
        <aside aria-label="Delivery zone fees" className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Delivery zones
          </h3>
          <ul className="space-y-1.5">
            {zones.map((z) => (
              <li
                key={z.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-gray-100"
              >
                <span
                  aria-hidden
                  className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-200"
                  style={{ background: z.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 text-sm truncate">{z.name}</div>
                  <div className="text-[11px] text-gray-500">
                    {z.deliveryFee > 0 ? `$${z.deliveryFee.toFixed(2)} fee` : "Free delivery"}
                    {z.minimumOrder > 0 ? ` · $${z.minimumOrder.toFixed(0)} min` : ""}
                    {z.estimatedMinutes > 0 ? ` · ~${z.estimatedMinutes} min` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
