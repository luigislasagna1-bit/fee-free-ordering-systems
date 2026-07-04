"use client";
import { useMemo, useRef } from "react";
import { GoogleMap, Marker, Circle } from "@react-google-maps/api";
import { MapContainer, TileLayer, Marker as LMarker, Circle as LCircle, Tooltip as LTooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useGoogleMaps } from "@/lib/use-google-maps";

export type Zone = {
  id: string;
  name: string;
  color: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  isActive: boolean;
};

interface Props {
  restaurantLat: number | null;
  restaurantLng: number | null;
  zones: Zone[];
  selectedZoneId: string | null;
  onZoneClick?: (zoneId: string) => void;
  onRestaurantMove?: (lat: number, lng: number) => void;
  /** Called when the user drags a zone's edge handle to resize it.
   *  The new radius is in km, rounded to one decimal. Parent should
   *  PATCH the zone via /api/admin/delivery/zones/[id] so other
   *  surfaces (hosted site, customer ordering) stay in sync. */
  onZoneResize?: (zoneId: string, newRadiusKm: number) => void;
  provider?: "leaflet" | "google";
  googleMapsApiKey?: string;
  /** Restaurant currency symbol for the zone popups' fee/min figures. */
  currencySym?: string;
}

function isValidCoord(lat: number | null, lng: number | null): lat is number {
  return lat !== null && lng !== null && !(lat === 0 && lng === 0);
}

export default function DeliveryMap(props: Props) {
  // Google Maps for every store when the PLATFORM browser key resolves
  // (Luigi 2026-07-04 — one platform key for all maps, restaurants never
  // bring their own; the key is referrer + API restricted in Google Cloud).
  // Leaflet/OSM remains the graceful fallback when no key is configured.
  if (props.googleMapsApiKey?.trim()) {
    return <GoogleVariant {...props} apiKey={props.googleMapsApiKey.trim()} />;
  }
  return <LeafletVariant {...props} />;
}

/** Great-circle distance in km — resize-handle math for the Google variant
 *  (Leaflet gets this from map.distance(); Google's geometry library isn't
 *  loaded, and a 10-line haversine beats another script chunk). */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─── Google variant ──────────────────────────────────────────────────────────
function GoogleVariant(props: Props & { apiKey: string }) {
  const {
    restaurantLat, restaurantLng, zones, selectedZoneId, onZoneClick, onRestaurantMove, onZoneResize, apiKey,
  } = props;
  const { isLoaded, loadError } = useGoogleMaps(apiKey);
  const mapRef = useRef<google.maps.Map | null>(null);
  const hasLocation = isValidCoord(restaurantLat, restaurantLng);
  const center = useMemo(
    () => hasLocation ? { lat: restaurantLat!, lng: restaurantLng! } : { lat: 44.0, lng: -79.5 },
    [hasLocation, restaurantLat, restaurantLng],
  );
  const sortedZones = useMemo(() => [...zones].sort((a, b) => b.radiusKm - a.radiusKm), [zones]);
  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );
  const containerStyle = { width: "100%", height: "100%", minHeight: 400 };

  // Key rejected (referrer allow-list — localhost, an unlisted reseller
  // custom domain, …) → a WORKING Leaflet map beats a dead error box.
  if (loadError) return <LeafletVariant {...props} />;
  if (!isLoaded) return <div style={containerStyle} className="bg-gray-100 animate-pulse" />;

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={hasLocation ? 12 : 6}
      onLoad={(map) => { mapRef.current = map; }}
      options={{ streetViewControl: false, mapTypeControl: true, fullscreenControl: false }}
    >
      {hasLocation && (
        <Marker
          position={center}
          draggable={!!onRestaurantMove}
          title="Restaurant (drag to adjust)"
          // Same green white-ringed dot the Leaflet variant uses, so the
          // provider swap doesn't change what owners recognise as "my store".
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9, fillColor: "#10b981", fillOpacity: 1,
            strokeColor: "#ffffff", strokeWeight: 3,
          }}
          onDragEnd={(e) => { if (e.latLng && onRestaurantMove) onRestaurantMove(e.latLng.lat(), e.latLng.lng()); }}
        />
      )}
      {hasLocation && sortedZones.map((zone) => {
        const isSelected = zone.id === selectedZoneId;
        const color = zone.isActive ? zone.color : "#9ca3af";
        return (
          <Circle
            key={zone.id}
            center={center}
            radius={zone.radiusKm * 1000}
            onClick={() => onZoneClick?.(zone.id)}
            options={{
              strokeColor: color, strokeOpacity: 0.9, strokeWeight: isSelected ? 3 : 1.5,
              fillColor: color, fillOpacity: isSelected ? 0.25 : 0.12, clickable: true,
            }}
          />
        );
      })}
      {/* Drag-to-resize handle on the selected circle's east edge — same
          behaviour as the Leaflet variant: drag out to grow, in to shrink;
          new radius = haversine(center, handle), clamped 0.1–100 km. */}
      {hasLocation && onZoneResize && selectedZone && (
        <Marker
          position={{
            lat: restaurantLat!,
            lng: restaurantLng! + lngOffsetForKm(restaurantLat!, selectedZone.radiusKm),
          }}
          draggable
          title={`${selectedZone.radiusKm} km — drag to resize`}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: selectedZone.isActive ? selectedZone.color : "#9ca3af",
            fillOpacity: 1,
            strokeColor: "#ffffff", strokeWeight: 3,
          }}
          onDragEnd={(e) => {
            if (!e.latLng) return;
            const km = Math.round(haversineKm(restaurantLat!, restaurantLng!, e.latLng.lat(), e.latLng.lng()) * 10) / 10;
            // Same sanity clamp as Leaflet: 0.1 km min, 100 km max.
            onZoneResize(selectedZone.id, Math.max(0.1, Math.min(100, km)));
          }}
        />
      )}
    </GoogleMap>
  );
}

// ─── Leaflet variant ─────────────────────────────────────────────────────────
const restaurantIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4);cursor:grab"></div>`,
  className: "", iconSize: [20, 20], iconAnchor: [10, 10],
});

/** Drag-to-resize handle that sits on the east edge of the selected
 *  zone's circle. Restaurant owners can grab + drag it outward to grow
 *  the radius or inward to shrink — way more intuitive than typing a
 *  number into a form field. Styled as a chunky white-outlined dot in
 *  the zone's color so it reads as "grab me" on first glance. */
const resizeHandleIcon = (color: string) => L.divIcon({
  html: `<div style="width:18px;height:18px;background:${color};border:3px solid white;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,0.25),0 2px 8px rgba(0,0,0,0.35);cursor:ew-resize"></div>`,
  className: "",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** Convert a radius in km to a longitude offset at a given latitude.
 *  Approximation good enough for placing a handle marker — exact
 *  resize math uses Leaflet's haversine map.distance() on dragend. */
function lngOffsetForKm(latDeg: number, km: number): number {
  // 111.32 km per degree of longitude AT the equator, scaled by cos(lat).
  const kmPerDeg = 111.32 * Math.cos((latDeg * Math.PI) / 180);
  return km / Math.max(kmPerDeg, 0.0001);
}

function LeafletVariant({
  restaurantLat, restaurantLng, zones, selectedZoneId, onZoneClick, onRestaurantMove, onZoneResize, currencySym = "$",
}: Props) {
  const hasLocation = isValidCoord(restaurantLat, restaurantLng);
  const initCenter: [number, number] = hasLocation
    ? [restaurantLat!, restaurantLng!]
    : [44.0, -79.5];

  const sortedZones = useMemo(() => [...zones].sort((a, b) => b.radiusKm - a.radiusKm), [zones]);
  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) ?? null,
    [zones, selectedZoneId],
  );

  return (
    <MapContainer
      center={initCenter}
      zoom={hasLocation ? 12 : 6}
      style={{ height: "100%", width: "100%", minHeight: 400 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {hasLocation && (
        <LMarker
          position={[restaurantLat!, restaurantLng!]}
          icon={restaurantIcon}
          draggable={!!onRestaurantMove}
          eventHandlers={{
            dragend: (e) => {
              const pos = (e.target as L.Marker).getLatLng();
              onRestaurantMove?.(pos.lat, pos.lng);
            },
          }}
        >
          <LTooltip>Restaurant (drag to adjust)</LTooltip>
        </LMarker>
      )}
      {hasLocation && sortedZones.map((zone) => {
        const isSelected = zone.id === selectedZoneId;
        const color = zone.isActive ? zone.color : "#9ca3af";
        return (
          <LCircle
            key={zone.id}
            center={[restaurantLat!, restaurantLng!]}
            radius={zone.radiusKm * 1000}
            pathOptions={{
              color, fillColor: color,
              fillOpacity: isSelected ? 0.25 : 0.12,
              weight: isSelected ? 3 : 1.5,
              dashArray: zone.isActive ? undefined : "6 4",
            }}
            eventHandlers={{ click: () => onZoneClick?.(zone.id) }}
          >
            <LTooltip sticky>
              <strong>{zone.name}</strong>
              <br />Fee: {currencySym}{zone.deliveryFee.toFixed(2)}
              <br />Min: {currencySym}{zone.minimumOrder.toFixed(2)}
              <br />Radius: {zone.radiusKm} km
              <br />ETA: ~{zone.estimatedMinutes} min
              {onZoneResize && isSelected && <><br /><em>Drag the handle to resize</em></>}
            </LTooltip>
          </LCircle>
        );
      })}

      {/* Drag-to-resize handle. Only rendered when:
            (a) the parent passed onZoneResize (some surfaces use the map
                read-only)
            (b) there's a currently-selected zone
          The handle floats on the east edge of the selected circle. When
          dragged, we compute the new radius from the geographic distance
          between the center and the new handle position. */}
      {hasLocation && onZoneResize && selectedZone && (
        <LMarker
          position={[
            restaurantLat!,
            restaurantLng! + lngOffsetForKm(restaurantLat!, selectedZone.radiusKm),
          ]}
          icon={resizeHandleIcon(selectedZone.isActive ? selectedZone.color : "#9ca3af")}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const handlePos = (e.target as L.Marker).getLatLng();
              const centerLatLng = L.latLng(restaurantLat!, restaurantLng!);
              const meters = centerLatLng.distanceTo(handlePos);
              const km = Math.round((meters / 1000) * 10) / 10;
              // Clamp to a sane range — 0.1 km min (anything smaller is
              // a UX accident), 100 km max (any further than that is
              // almost certainly a misclick — restaurants don't deliver
              // 100km).
              const clamped = Math.max(0.1, Math.min(100, km));
              onZoneResize(selectedZone.id, clamped);
            },
          }}
        >
          <LTooltip permanent direction="right" offset={[10, 0]}>
            <strong>{selectedZone.radiusKm} km</strong>
            <br /><em>drag to resize</em>
          </LTooltip>
        </LMarker>
      )}
    </MapContainer>
  );
}
