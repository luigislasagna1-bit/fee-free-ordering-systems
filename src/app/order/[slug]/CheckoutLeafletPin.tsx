"use client";
import { useEffect } from "react";
import { MapContainer, TileLayer, Marker as LMarker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/**
 * Compact draggable delivery pin for Leaflet (free / non-Google) restaurants.
 * Mirrors the inline GoogleMap pin in CheckoutModal so a customer on an
 * OpenStreetMap restaurant can fine-tune the exact door after picking an
 * address (Fabrizio report cmpxdxhxi — Leaflet had no map at all).
 *
 * Must be dynamically imported with { ssr: false } — Leaflet touches `window`.
 */

interface Props {
  /** Geocoded centre from the picked address (or restaurant fallback). */
  center: { lat: number; lng: number };
  /** Current pin coords (may differ from centre after a drag). */
  lat: number | null;
  lng: number | null;
  onMove: (lat: number, lng: number) => void;
}

// CONFIRMED — the customer picked this suggestion or dragged the pin here.
const pinIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.45);cursor:grab"></div>`,
  className: "",
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// INFERRED — nobody has confirmed this spot; it's where a geocoder guessed the
// typed address is. It must NOT look like the confirmed pin: `pos` below falls
// back to the map centre when lat/lng are null, so with one shared icon a pure
// guess rendered pixel-identical to a location the customer had approved. That
// is the whole failure this flow exists to stop — a customer can't check a spot
// they've been shown no reason to doubt. Amber, hollow and gently pulsing reads
// as "is this right?" without nagging. Luigi 2026-08-12.
const unconfirmedPinIcon = L.divIcon({
  html: `<div style="width:22px;height:22px;background:rgba(245,158,11,0.25);border:3px dashed #b45309;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.35);cursor:grab;animation:ffo-pin-pulse 1.8s ease-in-out infinite"></div>
         <style>@keyframes ffo-pin-pulse{0%,100%{transform:scale(1);opacity:.95}50%{transform:scale(1.18);opacity:.7}}
         @media (prefers-reduced-motion:reduce){div[style*="ffo-pin-pulse"]{animation:none!important}}</style>`,
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

// Recenter the map when a new address is picked (center prop changes) without
// snapping back while the customer is dragging the marker.
function Recenter({ center }: { center: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom() < 15 ? 16 : map.getZoom());
  }, [center.lat, center.lng, map]);
  return null;
}

function ClickHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function CheckoutLeafletPin({ center, lat, lng, onMove }: Props) {
  const pos: [number, number] = [lat ?? center.lat, lng ?? center.lng];
  // Coords exist only once the customer picked a suggestion or moved the pin.
  // Absent them, `pos` is the geocoder's guess — say so visually.
  const confirmed = lat != null && lng != null;
  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: 180, width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <Recenter center={center} />
      <ClickHandler onMove={onMove} />
      <LMarker
        position={pos}
        icon={confirmed ? pinIcon : unconfirmedPinIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const p = (e.target as L.Marker).getLatLng();
            onMove(p.lat, p.lng);
          },
        }}
      />
    </MapContainer>
  );
}
