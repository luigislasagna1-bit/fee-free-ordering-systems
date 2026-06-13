"use client";
import { useMemo, useRef } from "react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { MapContainer, TileLayer, Marker as LMarker, Tooltip as LTooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useGoogleMaps } from "@/lib/use-google-maps";
import { resolveMapsBrowserKey } from "@/lib/maps-key";

interface Props {
  lat: number | null;
  lng: number | null;
  onMove: (lat: number, lng: number) => void;
  provider?: "leaflet" | "google";
  googleMapsApiKey?: string;
}

export default function ProfileMap(props: Props) {
  // Use Google whenever a key resolves — the restaurant's own, else the platform
  // key. No key (env unset) ⇒ free Leaflet map. Luigi 2026-06-13.
  const apiKey = resolveMapsBrowserKey(props.googleMapsApiKey);
  if (apiKey) {
    return <GoogleVariant {...props} apiKey={apiKey} />;
  }
  return <LeafletVariant {...props} />;
}

function Placeholder({ msg, error }: { msg: string; error?: boolean }) {
  return (
    <div
      style={{ width: "100%", height: "100%", minHeight: 320 }}
      className={`flex items-center justify-center text-sm px-4 text-center ${
        error ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
      }`}
    >
      {msg}
    </div>
  );
}

// ─── Google variant ──────────────────────────────────────────────────────────
function GoogleVariant({ lat, lng, onMove, apiKey }: Props & { apiKey: string }) {
  const { isLoaded, loadError } = useGoogleMaps(apiKey);
  const mapRef = useRef<google.maps.Map | null>(null);
  const hasCoords = lat !== null && lng !== null;
  const center = useMemo(
    () => hasCoords ? { lat: lat!, lng: lng! } : { lat: 43.51, lng: -79.88 },
    [hasCoords, lat, lng],
  );
  const containerStyle = { width: "100%", height: "100%", minHeight: 320 };

  if (loadError) return <Placeholder msg="Couldn't load Google Maps. Check your API key restrictions." error />;
  if (!isLoaded) return <div style={containerStyle} className="bg-gray-100 animate-pulse" />;

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={hasCoords ? 15 : 10}
      onLoad={(map) => { mapRef.current = map; }}
      onClick={(e) => { if (e.latLng) onMove(e.latLng.lat(), e.latLng.lng()); }}
      options={{ streetViewControl: false, mapTypeControl: true, fullscreenControl: false }}
    >
      {hasCoords && (
        <Marker
          position={center}
          draggable
          title="Drag to fine-tune location"
          onDragEnd={(e) => { if (e.latLng) onMove(e.latLng.lat(), e.latLng.lng()); }}
        />
      )}
    </GoogleMap>
  );
}

// ─── Leaflet variant ─────────────────────────────────────────────────────────
const pinIcon = L.divIcon({
  html: `<div style="width:20px;height:20px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.4);cursor:grab"></div>`,
  className: "", iconSize: [20, 20], iconAnchor: [10, 10],
});

function ClickHandler({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function LeafletVariant({ lat, lng, onMove }: Props) {
  const hasCoords = lat !== null && lng !== null;
  const initCenter: [number, number] = hasCoords ? [lat!, lng!] : [43.51, -79.88];

  return (
    <MapContainer
      center={initCenter}
      zoom={hasCoords ? 15 : 10}
      style={{ height: "100%", width: "100%", minHeight: 320 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        maxZoom={19}
      />
      <ClickHandler onMove={onMove} />
      {hasCoords && (
        <LMarker
          position={[lat!, lng!]}
          icon={pinIcon}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const pos = (e.target as L.Marker).getLatLng();
              onMove(pos.lat, pos.lng);
            },
          }}
        >
          <LTooltip>Drag to fine-tune location</LTooltip>
        </LMarker>
      )}
    </MapContainer>
  );
}
