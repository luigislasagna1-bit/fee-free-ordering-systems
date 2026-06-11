/**
 * Delivery drive-distance + live-traffic ETA for the kitchen display
 * (reseller report cmq3kv70d — Gloriafood-parity). Given the restaurant's
 * origin and the customer's delivery address, calls the Google Distance Matrix
 * API for the DRIVING distance + duration, including duration-in-traffic at the
 * current departure time.
 *
 * Why server-side only: the Distance Matrix web-service endpoint does not allow
 * browser CORS requests, and the API key must never reach the client. The
 * kitchen detail fetches /api/kitchen/orders/[id]/eta which calls this.
 *
 * Key resolution: the restaurant's own googleMapsApiKey (the same key the
 * owner already pastes for Google maps) first, else a platform fallback env.
 * The key needs the "Distance Matrix API" enabled + billing on its Google
 * Cloud project. No key / disabled API / any error → { ok: false } so the
 * kitchen silently falls back to "open in maps" without a hard failure.
 */
const ENDPOINT = "https://maps.googleapis.com/maps/api/distancematrix/json";

export function resolveDistanceMatrixKey(restaurantKey?: string | null): string | null {
  return (
    restaurantKey?.trim() ||
    process.env.GOOGLE_DISTANCE_MATRIX_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    null
  );
}

export type DriveEstimate = {
  ok: boolean;
  /** Localised driving distance, e.g. "4.8 km". */
  distanceText?: string;
  /** Driving distance in kilometres (numeric, for our own formatting). */
  distanceKm?: number;
  /** Free-flow driving duration, e.g. "8 mins". */
  durationText?: string;
  /** Duration accounting for CURRENT traffic, e.g. "9 mins". Falls back to
   *  durationText when the API doesn't return a traffic figure. */
  durationInTrafficText?: string;
};

type Origin =
  | { lat: number; lng: number }
  | { address: string };

function originParam(o: Origin): string {
  return "lat" in o ? `${o.lat},${o.lng}` : o.address;
}

/**
 * Google Maps "directions to" deep link. Works in a browser (opens Google
 * Maps web) AND on Android/iOS (deep-links the native Maps app). Destination
 * is the customer's address string (or "lat,lng" when we have a pin).
 */
export function mapsDirectionsUrl(destination: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}

export async function fetchDriveEstimate(args: {
  apiKey: string;
  origin: Origin;
  destination: string;
}): Promise<DriveEstimate> {
  try {
    const params = new URLSearchParams({
      origins: originParam(args.origin),
      destinations: args.destination,
      mode: "driving",
      units: "metric",
      departure_time: "now", // unlocks duration_in_traffic
      key: args.apiKey,
    });
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (data?.status !== "OK" || !el || el.status !== "OK") return { ok: false };
    const distanceKm =
      typeof el.distance?.value === "number" ? el.distance.value / 1000 : undefined;
    return {
      ok: true,
      distanceText: el.distance?.text,
      distanceKm,
      durationText: el.duration?.text,
      durationInTrafficText: el.duration_in_traffic?.text ?? el.duration?.text,
    };
  } catch {
    return { ok: false };
  }
}
