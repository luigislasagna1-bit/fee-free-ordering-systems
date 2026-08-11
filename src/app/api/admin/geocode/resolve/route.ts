import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { resolveAddress } from "@/lib/nominatim";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Structured address fields → one best-guess map pin, for admin screens.
 *
 * The server walks the fallback ladder (see `resolveAddress`) so the browser
 * makes ONE request no matter how many rungs it takes, and Nominatim sees the
 * calls serialised and identified.
 *
 * POST /api/admin/geocode/resolve
 * body: { address?, city?, state?, zip?, country?, preciseOnly? }
 * → { match: { lat, lng, label, precise } | null }
 *
 * `precise: false` means we fell back to a city/postcode centroid — the caller
 * MUST tell the owner the pin is approximate rather than claim success.
 */
const MAX_FIELD = 200;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim().slice(0, MAX_FIELD) : "";
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Lower than the autocomplete bucket: one call here can cost up to four
  // upstream Nominatim requests when every rung misses.
  if (!rateLimit(`geocode:resolve:${user.id}`, 30, 60_000)) {
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
    { preciseOnly: body.preciseOnly === true },
  );

  return NextResponse.json({ match });
}
