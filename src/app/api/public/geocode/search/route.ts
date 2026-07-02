import { NextRequest, NextResponse } from "next/server";
import { composeStreetLine } from "@/lib/delivery-address-fields";

/**
 * Free address autocomplete for Leaflet (non-Google) restaurants. Proxies
 * OpenStreetMap Nominatim so we can (a) set a proper User-Agent — required by
 * Nominatim and not settable from a browser, and (b) add a short cache so a
 * busy restaurant's customers don't each hammer Nominatim (its policy caps at
 * ~1 req/sec/IP). The customer page debounces on top of this.
 *
 * GET /api/public/geocode/search?q=<query>[&country=<cc>]
 * → { suggestions: [{ label, lat, lng, line1, city, postcode }] }
 */

type Suggestion = { label: string; lat: number; lng: number; line1: string; city: string; postcode: string };

// Tiny in-memory cache (per server instance). Keyed by `${country}|${q}`.
// Cheap politeness layer — Vercel may spin many instances, but each one still
// collapses repeated identical lookups within its lifetime.
const CACHE = new Map<string, { at: number; data: Suggestion[] }>();
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const country = (req.nextUrl.searchParams.get("country") || "").trim().toLowerCase();
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  const key = `${country}|${q.toLowerCase()}`;
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ suggestions: cached.data }, { headers: { "Cache-Control": "public, max-age=600" } });
  }

  try {
    const params = new URLSearchParams({
      q, format: "json", addressdetails: "1", limit: "6",
    });
    // Bias to the restaurant's country when known — keeps an Italian
    // restaurant's customers from getting US street matches.
    if (/^[a-z]{2}$/.test(country)) params.set("countrycodes", country);

    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: { "User-Agent": "FeeFreeOrderingSystems/1.0 (support@feefreeordering.com)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NextResponse.json({ suggestions: [] });
    const rows: any[] = await res.json();

    const suggestions: Suggestion[] = (Array.isArray(rows) ? rows : []).map((row) => {
      const a = row.address || {};
      const houseNumber = a.house_number || "";
      const road = a.road || a.pedestrian || a.footway || a.neighbourhood || "";
      // House-number position follows the restaurant's country convention:
      // "Via Mazzini 13" (IT/DE/…) vs "13 Main St" (US/CA/GB/…). Fabrizio 2026-06-24.
      const line1 = composeStreetLine(road, houseNumber, country) || (row.name || "");
      const city = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || "";
      return {
        label: row.display_name || line1,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lon),
        line1,
        city,
        postcode: a.postcode || "",
      };
    }).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && (s.line1 || s.city));

    // Collapse rows the customer can't tell apart. Nominatim returns one hit per
    // OSM segment, so a single street like "Via Ro" can come back 4-6 times with
    // identical line1+city+postcode — that reads as a bug. Keep the first of each
    // visually-distinct entry; the kept one still carries a valid lat/lng.
    const seen = new Set<string>();
    const deduped = suggestions.filter((s) => {
      const k = `${s.line1}|${s.city}|${s.postcode}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (CACHE.size > CACHE_MAX) CACHE.clear();
    CACHE.set(key, { at: Date.now(), data: deduped });

    return NextResponse.json({ suggestions: deduped }, { headers: { "Cache-Control": "public, max-age=600" } });
  } catch {
    return NextResponse.json({ suggestions: [] });
  }
}
