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

export { isCoarseGeocode } from "./geocode-precision";

const ENDPOINT = "https://maps.googleapis.com/maps/api/geocode/json";

export type GoogleGeocodeResult = {
  /** A6 (2026-08-22): what KIND of place the top result is, so a caller who
   *  said a street is never pinned to a country/city centroid (call
   *  cmt2iowvh: a country-level hit became "Zone 8, $49.99"). */
  types?: string[];
  /** ROOFTOP | RANGE_INTERPOLATED | GEOMETRIC_CENTER | APPROXIMATE */
  locationType?: string | null;
  partialMatch?: boolean;
  lat: number;
  lng: number;
  label: string;
  postcode?: string | null;
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
      geometry?: { location?: { lat: number; lng: number }; location_type?: string };
      formatted_address?: string;
      address_components?: Array<{ long_name: string; types: string[] }>;
      types?: string[];
      partial_match?: boolean;
    };
    const loc = top?.geometry?.location;
    if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) return null;

    const label = top.formatted_address || q;
    const pcComp = top.address_components?.find((c) => c.types.includes("postal_code"));
    return {
      lat: loc.lat,
      lng: loc.lng,
      label: label.length > 90 ? `${label.slice(0, 89)}…` : label,
      postcode: pcComp?.long_name || null,
      types: Array.isArray(top.types) ? top.types.filter((t) => typeof t === "string") : [],
      locationType: typeof top.geometry?.location_type === "string" ? top.geometry.location_type : null,
      partialMatch: top.partial_match === true,
    };
  } catch {
    return null;
  }
}
