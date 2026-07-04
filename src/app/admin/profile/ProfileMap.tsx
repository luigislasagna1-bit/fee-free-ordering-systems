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
  // Google Maps whenever the platform browser key resolves (Luigi 2026-07-04 —
  // one platform key for all maps, same dispatch as the Delivery Zones editor).
  // Leaflet/OSM remains the graceful fallback when no key is configured.
  const key = resolveMapsBrowserKey(props.googleMapsApiKey);
  if (key) {
    return <GoogleVariant {...props} apiKey={key} />;
  }
  return <LeafletVariant {...props} />;
}

// ─── Google variant ──────────────────────────────────────────────────────────
function GoogleVariant(props: Props & { apiKey: string }) {
  const { lat, lng, onMove, apiKey } = props;
  const { isLoaded, loadError } = useGoogleMaps(apiKey);
  const mapRef = useRef<google.maps.Map | null>(null);
  const hasCoords = lat !== null && lng !== null;
  const center = useMemo(
    () => hasCoords ? { lat: lat!, lng: lng! } : { lat: 43.51, lng: -79.88 },
    [hasCoords, lat, lng],
  );
  const containerStyle = { width: "100%", height: "100%", minHeight: 320 };

  // Key rejected (referrer allow-list — localhost, an unlisted custom
  // domain, …) → a WORKING Leaflet map beats a dead error box.
  if (loadError) return <LeafletVariant {...props} />;
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
          // Same green white-ringed dot the Leaflet variant uses, so the
          // provider swap doesn't change what owners recognise as "my store".
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9, fillColor: "#10b981", fillOpacity: 1,
            strokeColor: "#ffffff", strokeWeight: 3,
          }}
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
