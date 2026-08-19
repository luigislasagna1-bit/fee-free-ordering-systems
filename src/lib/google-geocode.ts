import "server-only";

/**
 * Google Geocoding API fallback for addresses Nominatim cannot resolve —
 * landmarks, business names, and places that exist in Google but not in OSM.
 *
 * Used ONLY when Nominatim returns null (the primary path is unchanged).
 * The caller (check-address) keeps the returned coordinates and passes them
 * to place_order, so there is no quote/charge split.
 *
 * Cost: $5 per 1,000 requests — well inside the $200/month free credit.
 */

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

export type GoogleGeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

/**
 * Resolve a server-side Google Maps API key.
 * Same precedence as resolveDistanceMatrixKey in delivery-eta.ts.
 */
function resolveServerKey(platformKey?: string | null): string | null {
  return (
    platformKey?.trim() ||
    process.env.GOOGLE_DISTANCE_MATRIX_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    null
  );
}

/**
 * Geocode an address using Google's Geocoding API. Returns null on any
 * failure — never throws. Country is a hard `components` filter, NOT
 * query text, same as Nominatim's `countrycodes`.
 */
export async function googleGeocode(
  query: string,
  opts: { country?: string | null; platformKey?: string | null } = {},
): Promise<GoogleGeocodeResult | null> {
  const q = query.trim();
  if (q.length < 3) return null;

  const key = resolveServerKey(opts.platformKey);
  if (!key) return null;

  try {
    const params = new URLSearchParams({ address: q, key });
    const country = (opts.country || "").trim().toLowerCase();
    if (/^[a-z]{2}$/.test(country)) {
      params.set("components", `country:${country}`);
    }

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return null;

    const { status, results } = data as { status: string; results: unknown[] };
    if (status !== "OK" || !Array.isArray(results) || !results.length) return null;

    const top = results[0] as {
      geometry?: { location?: { lat: number; lng: number } };
      formatted_address?: string;
    };
    const loc = top?.geometry?.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;

    const label = top.formatted_address || q;
    return {
      lat: loc.lat,
      lng: loc.lng,
      label: label.length > 90 ? `${label.slice(0, 89)}…` : label,
    };
  } catch {
    return null;
  }
}
