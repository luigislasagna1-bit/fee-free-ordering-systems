import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { detectChannel, classifyDevice } from "@/lib/reports/channel-detection";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

/**
 * POST /api/track/visit
 *
 * Lightweight beacon called once per session by the customer order
 * page (and any other public-facing surface — hosted site, widget).
 *
 * Body: {
 *   restaurantId: string,
 *   sessionHash:  string,   // 32-char hex, generated client-side
 *   landingPath?: string,   // pathname only, no query string
 *   utm?: { source?, medium?, campaign? },
 *   fromMarketplace?: boolean,
 * }
 *
 * Writes ONE WebsiteVisit row + ONE WebsiteFunnelEvent (step="visit")
 * row. Both have indexes on (restaurantId, createdAt) so they don't
 * slow inserts and the reports can scan a date range efficiently.
 *
 * Privacy: We do NOT log IP, email, phone, or any personally
 * identifying detail. The sessionHash is client-generated and
 * deliberately opaque so it can't be reversed into an identity. The
 * country code (when available) comes from the Vercel geolocation
 * header — never derived from raw IP at our layer.
 *
 * Idempotency: the client sends one beacon per session start; if the
 * client retries (transient network failure) we accept the duplicate
 * — there's no unique constraint, and a duplicate visit row in the
 * reports is acceptable noise (rare + small).
 *
 * Performance: This endpoint is on the customer hot path — every
 * order-page load hits it. We do the minimum work synchronously
 * (validate + 2 inserts) and bail with 204 No Content fast. No
 * email sends, no Stripe calls, no notifications.
 */
export async function POST(req: NextRequest) {
  // ── Rate limit ───────────────────────────────────────────────────────
  // Cap visit beacons at 60 per IP per minute. A genuine user fires
  // ONE per session-start so 60/min is a 60× margin; a bot scraper or
  // misbehaving script gets clipped before it can pollute the visit
  // count. We respond 204 (success) on limit hits so attackers can't
  // distinguish our limiter — they just see "writes silently dropped."
  const ip = getClientIp(req);
  if (!rateLimit(`visit:${ip}`, 60, 60_000)) {
    return new NextResponse(null, { status: 204 });
  }

  let body: {
    restaurantId?: string;
    sessionHash?: string;
    landingPath?: string;
    utm?: { source?: string; medium?: string; campaign?: string };
    fromMarketplace?: boolean;
    ref?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { restaurantId, sessionHash } = body;
  if (typeof restaurantId !== "string" || restaurantId.length < 1 || restaurantId.length > 50) {
    return NextResponse.json({ error: "restaurantId required" }, { status: 400 });
  }
  if (typeof sessionHash !== "string" || !/^[a-f0-9]{16,64}$/i.test(sessionHash)) {
    return NextResponse.json({ error: "Invalid sessionHash" }, { status: 400 });
  }

  // Verify the restaurant exists + look up the configured domain for
  // internal-vs-referral detection. ONE small indexed query.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    // Pull the published domains so we can classify referrers from the
    // restaurant's own hosted site / subdomain / custom domain as
    // "internal" instead of "referral".
    select: { id: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true },
  });
  if (!restaurant) {
    // 204 — don't leak which IDs are valid via different status codes.
    // The visit just doesn't get logged.
    return new NextResponse(null, { status: 204 });
  }

  const referrer = req.headers.get("referer");
  const userAgent = req.headers.get("user-agent");
  const country = req.headers.get("x-vercel-ip-country") || null;
  // For "internal vs referral" classification we treat the platform's
  // own host (feefreeordering.com) as internal. A customer clicking
  // through from /admin's "View ordering page" link would otherwise
  // be miscategorized as "Referral". We pass the platform domain
  // (derived from NEXT_PUBLIC_APP_URL or hardcoded fallback) AND the
  // restaurant's own hosted-site host so both flow as "internal."
  const restaurantHosts = buildInternalHosts(restaurant);
  const channel = detectChannel({
    utm: body.utm,
    referrer,
    restaurantDomain: restaurantHosts,
    fromMarketplace: body.fromMarketplace,
  });
  const deviceType = classifyDevice(userAgent);
  const landingPath = (body.landingPath ?? "").slice(0, 255) || null;

  // Build the utm string for storage — opaque, max 255 chars.
  const utmString = body.utm
    ? [
        body.utm.source && `s:${body.utm.source}`,
        body.utm.medium && `m:${body.utm.medium}`,
        body.utm.campaign && `c:${body.utm.campaign}`,
      ].filter(Boolean).join("|").slice(0, 255) || null
    : null;

  // Marketing Studio smart-link code (?ref=) — a clean base62 code, resolved to
  // the SmartLink at order-create for per-link attribution. Luigi 2026-06-10.
  const refCode = typeof body.ref === "string" && /^[A-Za-z0-9]{1,32}$/.test(body.ref) ? body.ref : null;

  try {
    // Two inserts — same restaurant + sessionHash, related logically
    // but no DB-level enforcement (they're append-only logs).
    await prisma.$transaction([
      prisma.websiteVisit.create({
        data: {
          restaurantId: restaurant.id,
          sessionHash,
          channel,
          referrer: referrer?.slice(0, 255) ?? null,
          utm: utmString,
          refCode,
          landingPath,
          deviceType,
          country,
        },
      }),
      prisma.websiteFunnelEvent.create({
        data: {
          restaurantId: restaurant.id,
          sessionHash,
          step: "visit",
        },
      }),
    ]);
  } catch (err) {
    // Log + swallow — analytics failures must NEVER break the order
    // page. The 204 keeps the client happy.
    console.error("[track/visit] failed", { restaurantId: restaurant.id, err: err instanceof Error ? err.message : String(err) });
  }

  return new NextResponse(null, { status: 204 });
}

/**
 * Compose the list of hostnames that count as "internal" for channel
 * attribution — referrals from these are tagged "internal" instead
 * of "referral":
 *
 *   - The platform's own host (from NEXT_PUBLIC_APP_URL or
 *     NEXT_PUBLIC_PLATFORM_DOMAIN, with sensible fallback). Clicks
 *     from /admin or /superadmin into /order/<slug> hit this branch.
 *   - The restaurant's hosted-site subdomain (slug.platform).
 *   - The restaurant's verified custom domain, if any.
 *
 * Returns an array of hostnames (no protocol, no path).
 */
function buildInternalHosts(restaurant: {
  slug: string;
  subdomain: string | null;
  customDomain: string | null;
  customDomainStatus: string;
}): string[] {
  const hosts: string[] = [];
  const platform =
    parseHostname(process.env.NEXT_PUBLIC_APP_URL) ||
    process.env.NEXT_PUBLIC_PLATFORM_DOMAIN ||
    "feefreeordering.com";
  hosts.push(platform);
  if (restaurant.subdomain) {
    hosts.push(`${restaurant.subdomain}.${platform}`);
  }
  if (restaurant.customDomain && restaurant.customDomainStatus === "verified") {
    hosts.push(restaurant.customDomain);
  }
  return hosts;
}

/** Pull just the hostname from a full URL string. Returns null on
 *  unparseable input so the caller can fall through to defaults. */
function parseHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
