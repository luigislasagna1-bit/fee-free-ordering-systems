"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";

/**
 * Client-side Leaflet renderer for the Delivery Heatmap report.
 *
 * Receives the pre-aggregated (lat, lng, weight) tuples from the
 * server, renders them as a leaflet.heat layer on top of a base map
 * centered on the restaurant. Also overlays the existing delivery
 * zone rings so owners can see "X% of orders fall inside the 5km
 * zone" at a glance.
 *
 * Why a dedicated client component?
 *   - Leaflet pokes at `window` + `document` on import — pure ESM
 *     server import errors out under Next 16's RSC. Keeping this
 *     "use client" + dynamic-imported by the parent contains the
 *     mess.
 *   - leaflet.heat is plain JS (no React wrapper) and patches
 *     L.heatLayer; easier to ref the map directly than to fight
 *     react-leaflet's lifecycle.
 *
 * Empty state: when `points.length === 0` we still render the
 * basemap + zones — owners see the geography of their delivery area
 * with a "no data yet" overlay, not a blank box.
 */
export interface HeatPoint {
  lat: number;
  lng: number;
  /** 0..1 — currently always 1 because every Order is one delivery.
   *  Reserved for future "weight by order value" rendering. */
  weight?: number;
}

export interface DeliveryZoneOverlay {
  name: string;
  radiusKm: number;
  color: string;
}

export function HeatmapClient({
  restaurantLat, restaurantLng, restaurantName, points, zones,
}: {
  restaurantLat: number;
  restaurantLng: number;
  restaurantName: string;
  points: HeatPoint[];
  zones: DeliveryZoneOverlay[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Guard against double-init in React strict-mode dev.
    if (mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [restaurantLat, restaurantLng],
      zoom: 12,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Restaurant marker
    L.marker([restaurantLat, restaurantLng])
      .addTo(map)
      .bindPopup(`<strong>${escapeHtml(restaurantName)}</strong><br/>Your restaurant`);

    // Delivery zone rings — same color palette as the admin Delivery
    // page. Drawn beneath the heat layer so hot spots remain visible
    // over them.
    for (const z of zones) {
      L.circle([restaurantLat, restaurantLng], {
        radius: z.radiusKm * 1000,
        color: z.color,
        fillColor: z.color,
        fillOpacity: 0.04,
        weight: 2,
        dashArray: "4 4",
      }).addTo(map).bindTooltip(`${z.name} · ${z.radiusKm}km`);
    }

    // Heat layer. `leaflet.heat` mutates L globally so we cast.
    if (points.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const heatLayer = (L as any).heatLayer(
        points.map((p) => [p.lat, p.lng, p.weight ?? 1]),
        {
          radius: 25,
          blur: 18,
          maxZoom: 17,
          // GloriaFood-style gradient — cool blue at the edges, hot red
          // at the densest clusters. Matches owner intuition ("red =
          // where most orders come from").
          gradient: { 0.2: "#3b82f6", 0.4: "#22d3ee", 0.6: "#eab308", 0.8: "#f97316", 1.0: "#ef4444" },
        },
      );
      heatLayer.addTo(map);
    }

    // Auto-fit bounds to include all points + restaurant + biggest zone.
    if (points.length > 0) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
      bounds.extend([restaurantLat, restaurantLng]);
      map.fitBounds(bounds, { padding: [40, 40] });
    } else if (zones.length > 0) {
      // No orders yet — zoom to the largest delivery zone so the owner
      // still sees their service area.
      const maxRadius = Math.max(...zones.map((z) => z.radiusKm)) * 1000;
      const bounds = L.latLng(restaurantLat, restaurantLng).toBounds(maxRadius * 2);
      map.fitBounds(bounds);
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [restaurantLat, restaurantLng, restaurantName, points, zones]);

  return (
    <div className="relative">
      <div ref={containerRef} className="w-full h-[600px] rounded-xl overflow-hidden border border-gray-200" />
      {points.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/95 px-4 py-3 rounded-lg shadow border border-gray-200 max-w-xs text-center pointer-events-auto">
            <div className="text-sm font-semibold text-gray-800 mb-1">No delivery data yet</div>
            <p className="text-xs text-gray-500">
              The heatmap populates as delivery orders accrue. Each new order
              with a resolvable address adds one point.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
