"use client";

/**
 * Leaflet scene mounted client-side only (no SSR).
 *
 * Renders the OpenStreetMap tile layer, the restaurant pin, and one
 * Circle per delivery zone. Wrapped in DeliveryZonesMap.tsx which is
 * the SSR-safe dynamic-import entry point.
 */

import { MapContainer, TileLayer, Marker, Circle, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import L from "leaflet";
import type { ZoneForMap } from "./DeliveryZonesMap";

// Leaflet's default marker icon uses image paths that break under
// Next.js bundling. Replace with the standard CDN URLs once at module
// load so all markers in this app render correctly.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

/**
 * Helper component that calls map.fitBounds() once the map is ready, so
 * the initial view automatically zooms to encompass the restaurant pin
 * + all zones. Avoids hand-tuned zoom levels.
 */
function FitToZones({
  zones,
  restaurantLat,
  restaurantLng,
}: {
  zones: ZoneForMap[];
  restaurantLat: number | null;
  restaurantLng: number | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (zones.length === 0 && (restaurantLat == null || restaurantLng == null)) return;
    const bounds = L.latLngBounds([]);
    if (restaurantLat != null && restaurantLng != null) {
      bounds.extend([restaurantLat, restaurantLng]);
    }
    for (const z of zones) {
      // Add the bounding box of each circle (approx) so the largest zone
      // fits in the initial view. 1 deg lat ≈ 111 km.
      const dLat = z.radiusKm / 111;
      const dLng = z.radiusKm / (111 * Math.cos((z.centerLat * Math.PI) / 180));
      bounds.extend([z.centerLat + dLat, z.centerLng + dLng]);
      bounds.extend([z.centerLat - dLat, z.centerLng - dLng]);
    }
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [30, 30] });
    }
  }, [map, zones, restaurantLat, restaurantLng]);
  return null;
}

export default function DeliveryZonesMapScene({
  center,
  initialZoom,
  restaurantName,
  restaurantLat,
  restaurantLng,
  zones,
  primaryColor,
}: {
  center: [number, number];
  initialZoom: number;
  restaurantName: string;
  restaurantLat: number | null;
  restaurantLng: number | null;
  zones: ZoneForMap[];
  primaryColor: string;
}) {
  return (
    <MapContainer
      center={center}
      zoom={initialZoom}
      scrollWheelZoom={false}
      style={{ height: "min(60vh, 480px)", width: "100%" }}
      attributionControl
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitToZones
        zones={zones}
        restaurantLat={restaurantLat}
        restaurantLng={restaurantLng}
      />

      {/* Zone circles. Render largest first so smaller ones layer on top
          and stay visible — Leaflet uses paint order, no z-index. */}
      {[...zones]
        .sort((a, b) => b.radiusKm - a.radiusKm)
        .map((z) => (
          <Circle
            key={z.id}
            center={[z.centerLat, z.centerLng]}
            radius={z.radiusKm * 1000 /* metres */}
            pathOptions={{
              color: z.color,
              fillColor: z.color,
              fillOpacity: 0.18,
              weight: 2,
            }}
          >
            <Tooltip direction="center" sticky>
              <div className="text-xs">
                <strong>{z.name}</strong>
                <br />
                {z.deliveryFee > 0 ? `$${z.deliveryFee.toFixed(2)} fee` : "Free delivery"}
                {z.minimumOrder > 0 ? ` · $${z.minimumOrder.toFixed(0)} min` : ""}
              </div>
            </Tooltip>
          </Circle>
        ))}

      {/* Restaurant pin — primary color, larger than the standard marker
          so it pops above the zone overlays. */}
      {restaurantLat != null && restaurantLng != null && (
        <Marker
          position={[restaurantLat, restaurantLng]}
          icon={L.divIcon({
            className: "",
            html: `<div style="
              width:24px;height:24px;border-radius:50%;
              background:${primaryColor};border:3px solid white;
              box-shadow:0 2px 6px rgba(0,0,0,0.25);
            "></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          })}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            {restaurantName}
          </Tooltip>
        </Marker>
      )}
    </MapContainer>
  );
}
