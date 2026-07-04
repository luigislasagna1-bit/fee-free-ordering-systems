/**
 * Platform-wide Google Maps key resolution.
 *
 * ONE key for everything (Luigi 2026-07-04): restaurants never bring their own
 * Google key — the platform key is used always, for every store. (Until
 * 2026-07-04 a restaurant's own key could override; that's retired — any
 * legacy Restaurant.googleMapsApiKey values are ignored everywhere.)
 *
 * TWO platform keys, by exposure:
 *   • BROWSER key — PlatformSettings.googleMapsApiKey (Superadmin → Maps
 *     Settings), resolved server-side via getPlatformGoogleKey() and passed to
 *     clients through each page's existing `googleMapsApiKey` prop; the
 *     NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY env var is only a fallback. Used for
 *     the Maps JS SDK: map tiles, draggable pins, Places Autocomplete. It is
 *     NECESSARILY visible in the browser, so it MUST be locked down in Google
 *     Cloud with HTTP-referrer restrictions (our domains) + API restrictions
 *     (Maps JS + Places only) + a billing budget alert.
 *   • SERVER key — GOOGLE_DISTANCE_MATRIX_KEY / GOOGLE_MAPS_API_KEY envs (or
 *     the platform key); never shipped to the browser; used in API routes for
 *     Distance Matrix + server geocoding. See resolveDistanceMatrixKey() in
 *     src/lib/delivery-eta.ts.
 *
 * NOTE on custom domains: the browser key's referrer allow-list must include any
 * reseller custom domain serving the ordering page, or those pages fall back to
 * the free Leaflet/OSM map. The fallback is graceful (no broken UI).
 */

/** Browser-side Google Maps key: the platform key the server resolved into the
 *  page's `googleMapsApiKey` prop (getPlatformGoogleKey()), else the build-time
 *  env fallback. Empty string ⇒ no Google → callers use Leaflet/OSM. */
export function resolveMapsBrowserKey(platformKey?: string | null): string {
  return platformKey?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || "";
}
