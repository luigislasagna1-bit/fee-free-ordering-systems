/**
 * Platform-wide Google Maps key resolution (Luigi 2026-06-13).
 *
 * Restaurants should NOT have to create a Google Cloud project and paste their
 * own key — most never will. Instead the PLATFORM provides one key for every
 * account (same model as the shared Twilio account). A restaurant's own key, if
 * they set one, still wins so a very high-volume tenant can offload cost.
 *
 * TWO keys, by exposure:
 *   • BROWSER key  (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) — used client-side for
 *     the Maps JS SDK: map tiles, the draggable pin, and Places Autocomplete.
 *     It is NECESSARILY visible in the browser, so it MUST be locked down in
 *     Google Cloud with HTTP-referrer restrictions (our domains) + API
 *     restrictions (Maps JS + Places only) + a billing budget alert.
 *   • SERVER key   (GOOGLE_MAPS_API_KEY / GOOGLE_DISTANCE_MATRIX_KEY) — never
 *     shipped to the browser; used in API routes for Distance Matrix + server
 *     geocoding. See resolveDistanceMatrixKey() in src/lib/delivery-eta.ts.
 *
 * NOTE on custom domains: the browser key's referrer allow-list must include any
 * reseller custom domain serving the ordering page, or those pages fall back to
 * the free Leaflet/OSM map. The fallback is graceful (no broken UI).
 */

/** Browser-side Google Maps key for a given restaurant: their own key if set,
 *  else the platform key. Empty string ⇒ no Google → callers use Leaflet/OSM. */
export function resolveMapsBrowserKey(restaurantKey?: string | null): string {
  return restaurantKey?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "";
}
