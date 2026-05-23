"use client";
import { useMemo } from "react";
import { GoogleMap, Marker, Circle } from "@react-google-maps/api";
import { MapContainer, TileLayer, Marker as LMarker, Circle as LCircle, Tooltip as LTooltip } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useGoogleMaps } from "@/lib/use-google-maps";

export type CustomerZone = {
  id: string;
  name: string;
  color: string;
  radiusKm: number;
  deliveryFee: number;
  minimumOrder: number;
  estimatedMinutes: number;
  isActive: boolean;
};

interface Props {
  restaurantLat: number;
  restaurantLng: number;
  zones: CustomerZone[];
  customerLat?: number | null;
  customerLng?: number | null;
  compact?: boolean;
  provider?: "leaflet" | "google";
  googleMapsApiKey?: string;
}

export default function DeliveryZonesMap(props: Props) {
  const provider = props.provider ?? "leaflet";
  if (provider === "google") {
    if (!props.googleMapsApiKey) {
      return (
        <Placeholder
          compact={props.compact}
          msg="Google Maps API key missing — set it in Admin → Map Settings."
        />
      );
    }
    return <GoogleVariant {...props} apiKey={props.googleMapsApiKey} />;
  }
  return <LeafletVariant {...props} />;
}

function Placeholder({ compact, msg, error }: { compact?: boolean; msg: string; error?: boolean }) {
  return (
    <div
      style={{ height: compact ? 280 : 420, borderRadius: 12 }}
      className={`w-full flex items-center justify-center text-sm px-4 text-center ${
        error ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
      }`}
    >
      {msg}
    </div>
  );
}

// ─── Google Maps variant ─────────────────────────────────────────────────────
function GoogleVariant({
  restaurantLat, restaurantLng, zones, customerLat, customerLng, compact, apiKey,
}: Props & { apiKey: string }) {
  const { isLoaded, loadError } = useGoogleMaps(apiKey);
  const center = useMemo(() => ({ lat: restaurantLat, lng: restaurantLng }), [restaurantLat, restaurantLng]);
  const sortedZones = useMemo(
    () => zones.filter((z) => z.isActive).slice().sort((a, b) => b.radiusKm - a.radiusKm),
    [zones],
  );

  const containerStyle = { width: "100%", height: compact ? 280 : 420, borderRadius: 12 };

  if (loadError) return <Placeholder compact={compact} msg="Couldn't load Google Maps. Check your API key restrictions." error />;
  if (!isLoaded) return <div style={containerStyle} className="bg-gray-100 animate-pulse" />;

  const onLoad = (map: google.maps.Map) => {
    const largest = sortedZones[0];
    if (!largest) return;
    const circle = new google.maps.Circle({ center, radius: largest.radiusKm * 1000 });
    map.fitBounds(circle.getBounds()!, 24);
  };

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={11}
      onLoad={onLoad}
      options={{ scrollwheel: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false }}
    >
      <Marker position={center} title="Restaurant" />
      {sortedZones.map((zone) => (
        <Circle key={zone.id} center={center} radius={zone.radiusKm * 1000}
          options={{ strokeColor: zone.color, strokeOpacity: 0.9, strokeWeight: 1.5, fillColor: zone.color, fillOpacity: 0.13, clickable: false }}
        />
      ))}
      {customerLat != null && customerLng != null && (
        <Marker
          position={{ lat: customerLat, lng: customerLng }}
          title="Your address"
          icon={{ path: google.maps.SymbolPath.CIRCLE, scale: 7, fillColor: "#2563eb", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 }}
        />
      )}
    </GoogleMap>
  );
}

// ─── Leaflet variant ─────────────────────────────────────────────────────────
const restaurantIcon = L.divIcon({
  html: `<div style="width:18px;height:18px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
  className: "", iconSize: [18, 18], iconAnchor: [9, 9],
});
const customerIcon = L.divIcon({
  html: `<div style="width:14px;height:14px;background:#2563eb;border:2px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
  className: "", iconSize: [14, 14], iconAnchor: [7, 7],
});

function LeafletVariant({
  restaurantLat, restaurantLng, zones, customerLat, customerLng, compact,
}: Props) {
  const sortedZones = useMemo(
    () => zones.filter((z) => z.isActive).slice().sort((a, b) => b.radiusKm - a.radiusKm),
    [zones],
  );

  // Fit bounds to the largest zone diameter ≈ 2.4×.
  const largest = sortedZones[0];
  const initialZoom = !largest ? 13 : largest.radiusKm <= 2 ? 13 : largest.radiusKm <= 8 ? 11 : 10;

  return (
    <MapContainer
      center={[restaurantLat, restaurantLng]}
      zoom={initialZoom}
      scrollWheelZoom={false}
      style={{ height: compact ? 280 : 420, width: "100%", borderRadius: 12 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <LMarker position={[restaurantLat, restaurantLng]} icon={restaurantIcon}>
        <LTooltip>Restaurant</LTooltip>
      </LMarker>
      {sortedZones.map((zone) => (
        <LCircle
          key={zone.id}
          center={[restaurantLat, restaurantLng]}
          radius={zone.radiusKm * 1000}
          pathOptions={{ color: zone.color, fillColor: zone.color, fillOpacity: 0.13, weight: 1.5 }}
        >
          <LTooltip sticky>
            <strong>{zone.name}</strong>
            <br />Fee: ${zone.deliveryFee.toFixed(2)}
            {zone.minimumOrder > 0 && <><br />Min: ${zone.minimumOrder.toFixed(2)}</>}
            <br />ETA: ~{zone.estimatedMinutes} min
          </LTooltip>
        </LCircle>
      ))}
      {customerLat != null && customerLng != null && (
        <LMarker position={[customerLat, customerLng]} icon={customerIcon}>
          <LTooltip>Your address</LTooltip>
        </LMarker>
      )}
    </MapContainer>
  );
}
