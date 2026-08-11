import { NextRequest, NextResponse } from "next/server";
import { nominatimSearch } from "@/lib/nominatim";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Free address autocomplete for Leaflet (non-Google) restaurants. Proxies
 * OpenStreetMap Nominatim so we can (a) set a proper User-Agent — required by
 * Nominatim and not settable from a browser, and (b) add a short cache so a
 * busy restaurant's customers don't each hammer Nominatim (its policy caps at
 * ~1 req/sec/IP). The customer page debounces on top of this.
 *
 * The Nominatim call, shaping, dedupe and cache all live in
 * `src/lib/nominatim.ts` — shared with the session-guarded admin routes.
 *
 * GET /api/public/geocode/search?q=<query>[&country=<cc>]
 * → { suggestions: [{ id, label, lat, lng, line1, city, state, postcode, countryCode }] }
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const country = (req.nextUrl.searchParams.get("country") || "").trim();
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  // Cost/politeness cap: this proxy is now also the fallback when Google
  // Places is down for a Google-keyed store, so a Places outage would
  // otherwise redirect every typing customer here at once. A human behind
  // the client's 400ms debounce stays far under 20/min; in-memory (per
  // isolate) is fine — it's Nominatim-politeness, not a security boundary.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`geocode:${ip}`, 20, 60_000)) {
    return NextResponse.json({ suggestions: [] }, { status: 429 });
  }

  const suggestions = await nominatimSearch(q, { country, limit: 6 });
  // Only cache HITS. An empty list can mean "Nominatim just 5xx'd", and a
  // browser-cached miss would keep a customer stuck on "no results" for the
  // next 10 minutes of typing that same address.
  return NextResponse.json(
    { suggestions },
    { headers: { "Cache-Control": suggestions.length ? "public, max-age=600" : "no-store" } },
  );
}
