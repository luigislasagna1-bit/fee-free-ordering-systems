import { NextRequest, NextResponse } from "next/server";
import { resolveAddress } from "@/lib/nominatim";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Structured delivery address → one map pin, for the CUSTOMER ordering page.
 *
 * Why this exists (Luigi 2026-08-11, Ben Bilton's $7.99 report):
 * the ordering page used to call `geocodeAddress()` straight from the BROWSER.
 * That is the raw single-shot Nominatim query — no country bias, no fallback
 * ladder, no cache, and its `User-Agent` header is silently dropped because
 * browsers forbid setting it, so the call went out anonymously against
 * Nominatim's usage policy. One unmatchable token (an apartment number in the
 * street line) returned zero results, the address got no coordinates, no
 * delivery zone was resolved, and a zone-restricted free-delivery promo was
 * refused — the customer saw the flat fee on a cart that qualified for free
 * delivery.
 *
 * Everything now goes through `resolveAddress()` on the server: identified UA,
 * country-biased, cached, and it walks the shortening ladder (including a rung
 * with the apartment stripped) instead of giving up on the first miss. The
 * CHARGE path uses the same resolver, so what the cart shows and what the order
 * is billed can't be decided by two different geocoders.
 *
 * `preciseOnly` is forced ON: a city-centroid pin would silently drop every
 * customer into the innermost delivery zone. For zone resolution, "we don't
 * know" must stay "we don't know" — the page then asks for a map pin.
 *
 * POST /api/public/geocode/resolve
 * body: { address?, city?, state?, zip?, country? }
 * → { match: { lat, lng, label, precise } | null }
 */
const MAX_FIELD = 200;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "";
}

export async function POST(req: NextRequest) {
  // Politeness cap, not a security boundary — one call here can cost up to four
  // upstream Nominatim requests when every rung misses. A human behind the
  // page's 700ms debounce stays far under this.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`geocode:resolve:public:${ip}`, 20, 60_000)) {
    return NextResponse.json({ match: null, rateLimited: true }, { status: 429 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const match = await resolveAddress(
    {
      address: str(body.address),
      city: str(body.city),
      state: str(body.state),
      zip: str(body.zip),
      country: str(body.country),
    },
    { preciseOnly: true },
  );

  // Only cache HITS. A cached miss would keep a customer stuck on "we couldn't
  // find that" for ten minutes of typing the very same address.
  return NextResponse.json(
    { match },
    { headers: { "Cache-Control": match ? "public, max-age=600" : "no-store" } },
  );
}
