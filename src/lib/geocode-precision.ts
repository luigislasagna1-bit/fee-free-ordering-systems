/**
 * Geocode precision policy (A6 / C13, 2026-08-22). Pure — no server-only
 * import — so the voice tests can exercise it. Consumed by
 * src/app/api/internal/voice/check-address (the Google fallback) via
 * google-geocode.ts.
 */
/** Result types that are a STREET-LEVEL place (a pin worth trusting for delivery). */
const PRECISE_TYPES = new Set(["street_address", "premise", "subpremise", "route", "intersection", "establishment", "point_of_interest", "airport", "park", "university", "hospital", "shopping_mall", "stadium", "store", "restaurant", "lodging", "transit_station", "bus_station", "train_station"]);
/** Result types that are an AREA, not an address. */
const COARSE_TYPES = new Set(["country", "administrative_area_level_1", "administrative_area_level_2", "administrative_area_level_3", "locality", "sublocality", "sublocality_level_1", "postal_code", "postal_code_prefix", "postal_town", "neighborhood", "colloquial_area", "natural_feature", "continent"]);

/**
 * A6 / C13: should this geocode hit be trusted as a delivery pin? A hit whose
 * types say "area" (country, city, postcode, neighbourhood) with no
 * street-level type is a centroid — it looks located and points the zone
 * lookup at the wrong place. An APPROXIMATE location with no precise type is
 * treated the same way.
 */
export function isCoarseGeocode(r: { types?: string[] | null; locationType?: string | null } | null | undefined): boolean {
  if (!r) return true;
  const types = r.types ?? [];
  if (types.some((t) => PRECISE_TYPES.has(t))) return false;
  if (types.some((t) => COARSE_TYPES.has(t))) return true;
  return r.locationType === "APPROXIMATE";
}
