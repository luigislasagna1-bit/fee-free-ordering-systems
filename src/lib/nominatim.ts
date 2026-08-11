/**
 * Nominatim (OpenStreetMap) geocoding — the ONE place that talks to
 * nominatim.openstreetmap.org.
 *
 * Why this module exists (Luigi 2026-08-10):
 * Several admin screens used to fetch Nominatim DIRECTLY FROM THE BROWSER with
 * a `User-Agent` header. Browsers treat User-Agent as a forbidden header and
 * silently drop it, so those calls went out anonymously — against Nominatim's
 * usage policy and blockable at any time. They also skipped the country bias
 * and the cache. Everything now goes through the server, which can set a real
 * identifying UA.
 *
 * Free-form Nominatim search is AND-matching: ONE token it can't match returns
 * zero results, with no partial or fuzzy fallback. A Pakistani address like
 * "B17, Islamabad, Qurtabad School" therefore geocodes to nothing, because the
 * school isn't in OSM. `resolveAddress()` walks a ladder of progressively
 * shorter queries so we land a usable pin instead of an error — and reports
 * whether the hit was street-level (`precise`) or a coarse city/postcode
 * centroid, so the UI can tell the owner the truth.
 */
import { composeStreetLine } from "@/lib/delivery-address-fields";

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
/** Nominatim's policy requires an identifying UA with a contact address.
 *  Server-side only — a browser would drop this header. */
const USER_AGENT = "FeeFreeOrderingSystems/1.0 (support@feefreeordering.com)";

export type GeoSuggestion = {
  /** Stable key for React lists (OSM place_id). */
  id: string;
  /** Full human-readable match, e.g. "B 17, Zone III, Islamabad…". */
  label: string;
  lat: number;
  lng: number;
  line1: string;
  city: string;
  state: string;
  postcode: string;
  /** ISO-3166-1 alpha-2, UPPERCASE ("PK"). Empty when OSM didn't say. */
  countryCode: string;
};

// Tiny in-memory cache (per server instance), shared by every caller. Keyed by
// `${country}|${limit}|${q}`. Cheap politeness layer — Vercel may spin many
// instances, but each one still collapses repeated identical lookups.
const CACHE = new Map<string, { at: number; data: GeoSuggestion[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

function isCountryCode(cc: string): boolean {
  return /^[a-z]{2}$/.test(cc);
}

/**
 * Query Nominatim and shape the rows into GeoSuggestions.
 * SERVER-SIDE ONLY. Returns [] on any failure — never throws.
 *
 * @param country ISO-3166 alpha-2 (any case). When valid it becomes a HARD
 *   `countrycodes` filter, which keeps an Italian restaurant's customers from
 *   getting US street matches — and stops a bare street name resolving to the
 *   wrong continent.
 */
export async function nominatimSearch(
  query: string,
  opts: { country?: string | null; limit?: number } = {},
): Promise<GeoSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const country = (opts.country || "").trim().toLowerCase();
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 10);

  const key = `${country}|${limit}|${q.toLowerCase()}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;

  try {
    const params = new URLSearchParams({
      q,
      format: "json",
      addressdetails: "1",
      limit: String(limit),
    });
    if (isCountryCode(country)) params.set("countrycodes", country);

    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const rows: unknown = await res.json();

    const shaped = (Array.isArray(rows) ? rows : []).map(shapeRow).filter(
      (s): s is GeoSuggestion =>
        s !== null && Number.isFinite(s.lat) && Number.isFinite(s.lng) && Boolean(s.line1 || s.city),
    );
    const deduped = dedupe(shaped);

    if (CACHE.size > CACHE_MAX) CACHE.clear();
    CACHE.set(key, { at: Date.now(), data: deduped });
    return deduped;
  } catch {
    return [];
  }
}

function shapeRow(row: any): GeoSuggestion | null {
  if (!row || typeof row !== "object") return null;
  const a = row.address || {};
  const cc: string = (a.country_code || "").toLowerCase();
  const houseNumber = a.house_number || "";
  const road = a.road || a.pedestrian || a.footway || a.neighbourhood || "";
  // House-number position follows the matched country's convention:
  // "Via Mazzini 13" (IT/DE/…) vs "13 Main St" (US/CA/GB/…). Fabrizio 2026-06-24.
  const line1 = composeStreetLine(road, houseNumber, cc) || (row.name || "");
  return {
    id: String(row.place_id ?? `${row.lat},${row.lon}`),
    label: row.display_name || line1,
    lat: parseFloat(row.lat),
    lng: parseFloat(row.lon),
    line1,
    city: a.city || a.town || a.village || a.municipality || a.hamlet || a.county || "",
    state: a.state || a.province || "",
    postcode: a.postcode || "",
    countryCode: cc.toUpperCase(),
  };
}

/**
 * Collapse rows a human can't tell apart. Nominatim returns one hit per OSM
 * segment, so a single street like "Via Ro" can come back 4-6 times with
 * identical line1+city+postcode — that reads as a bug. Keep the first of each
 * visually-distinct entry; the kept one still carries a valid lat/lng.
 */
function dedupe(list: GeoSuggestion[]): GeoSuggestion[] {
  const seen = new Set<string>();
  return list.filter((s) => {
    const k = `${s.line1}|${s.city}|${s.postcode}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ─── Structured address → coordinates ────────────────────────────────────────

export type AddressParts = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** ISO-3166 alpha-2. Applied as a countrycodes filter, NOT as query text. */
  country?: string | null;
};

/** One rung of the fallback ladder. `precise` = the query still carries the
 *  street line, so a hit is street-level rather than a centroid. */
export type AddressQuery = { q: string; precise: boolean };

/**
 * Build progressively-shorter queries, most precise first.
 *
 * The country is deliberately NOT in the query text — it goes to Nominatim as
 * a `countrycodes` filter instead, which is a hard constraint rather than one
 * more token that has to match. Rung 2 drops the postcode and region because a
 * postcode that disagrees with OSM (Islamabad's B-17 is 42225, but owners type
 * the city-wide 44000) is the most common cause of a zero-result street query.
 */
export function buildAddressQueries(parts: AddressParts): AddressQuery[] {
  const address = (parts.address || "").trim();
  const city = (parts.city || "").trim();
  const state = (parts.state || "").trim();
  const zip = (parts.zip || "").trim();

  const rungs: AddressQuery[] = [
    { q: [address, city, state, zip].filter(Boolean).join(", "), precise: !!address },
    { q: [address, city].filter(Boolean).join(", "), precise: !!address },
    { q: [city, state, zip].filter(Boolean).join(", "), precise: false },
    { q: [city].filter(Boolean).join(", "), precise: false },
  ];

  const seen = new Set<string>();
  return rungs.filter((r) => {
    const k = r.q.toLowerCase();
    if (!r.q || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type ResolvedAddress = {
  lat: number;
  lng: number;
  /** What Nominatim actually matched — show this when `precise` is false so
   *  the owner knows the pin is approximate and worth dragging. */
  label: string;
  precise: boolean;
};

/**
 * Structured address fields → one best-guess pin.
 * SERVER-SIDE ONLY. Returns null when even the coarsest rung misses.
 *
 * @param opts.preciseOnly Refuse coarse (city/postcode centroid) matches. Use
 *   this for SILENT/automatic geocoding: quietly dropping a pin on a city
 *   centroid looks "done" while pointing delivery-zone radii at the wrong
 *   origin — worse than the visible "No location set" warning.
 */
export async function resolveAddress(
  parts: AddressParts,
  opts: { preciseOnly?: boolean } = {},
): Promise<ResolvedAddress | null> {
  const country = (parts.country || "").trim().toLowerCase();
  const rungs = buildAddressQueries(parts).filter((r) => !opts.preciseOnly || r.precise);

  for (const rung of rungs) {
    // Sequential on purpose: Nominatim's policy caps at ~1 req/s, and we stop
    // at the first hit — the overwhelmingly common case is one call.
    const hits = await nominatimSearch(rung.q, { country, limit: 1 });
    if (hits.length) {
      const top = hits[0];
      return {
        lat: top.lat,
        lng: top.lng,
        label: top.label.length > 90 ? `${top.label.slice(0, 89)}…` : top.label,
        precise: rung.precise,
      };
    }
  }
  return null;
}
