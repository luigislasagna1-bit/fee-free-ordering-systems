import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { nominatimSearch } from "@/lib/nominatim";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Address autocomplete for ADMIN screens (Restaurant Profile, Delivery Zones).
 *
 * Separate from /api/public/geocode/search on purpose: the public route's
 * 20/min IP bucket is sized for a customer typing one delivery address behind
 * a 400ms debounce. An owner filling in their profile fires far more lookups
 * (autocomplete + the auto-geocode on every settled field edit), and getting
 * silently 429'd would look exactly like the "address not found" bug we're
 * fixing. Session-guarded and keyed per user, so it can be roomier.
 *
 * GET /api/admin/geocode/search?q=<query>[&country=<cc>]
 * → { suggestions: GeoSuggestion[] }
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 200);
  const country = (req.nextUrl.searchParams.get("country") || "").trim();
  if (q.length < 3) return NextResponse.json({ suggestions: [] });

  if (!rateLimit(`geocode:admin:${user.id}`, 60, 60_000)) {
    return NextResponse.json({ suggestions: [], rateLimited: true }, { status: 429 });
  }

  const suggestions = await nominatimSearch(q, { country, limit: 6 });
  return NextResponse.json({ suggestions });
}
