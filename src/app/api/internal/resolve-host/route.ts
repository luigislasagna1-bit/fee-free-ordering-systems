import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";

// Force Node runtime — Prisma cannot run in edge runtime.
export const runtime = "nodejs";

/**
 * Internal-only host → tenant resolver. Called by the edge middleware whose
 * LRU misses on a host. Gated by a shared secret so it cannot be enumerated
 * from the public internet (otherwise a bot could probe for tenant slugs
 * cheaply).
 *
 * Query params:
 *   by    = "subdomain" | "customDomain"
 *   value = the value to look up (already lowercased by caller)
 *
 * Returns: { slug: string | null, hasHostedSite: boolean, resellerProfileId?: string | null }
 * `hasHostedSite` is true when the restaurant has an active
 * `hosted_marketing_page` entitlement (granted by the "Sales Optimized
 * Website" add-on). The middleware uses it to decide whether
 * `<slug>.<platform>/` rewrites to /site/<slug> (the hosted marketing page)
 * or /order/<slug> (the ordering page) for the root path.
 *
 * For `by=customDomain` only: when no Restaurant matches but a
 * ResellerProfile's verified customDomain does, we return
 * { slug: null, resellerProfileId: "..." }. The proxy then rewrites to
 * /login?reseller=<id> (the branded login screen) instead of /order/<slug>.
 * This is the "Full tier" white-label domain experience — partners get
 * their own login URL with their logo + title.
 */
export async function GET(req: NextRequest) {
  const headerKey = req.headers.get("x-internal-key");
  const expectedKey = process.env.INTERNAL_API_SECRET;

  // In dev we don't require the secret so local middleware works without env
  // setup. In production we always require it.
  if (process.env.NODE_ENV === "production") {
    if (!expectedKey || headerKey !== expectedKey) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const by = req.nextUrl.searchParams.get("by");
  const value = (req.nextUrl.searchParams.get("value") || "").toLowerCase().trim();

  if (!value) return NextResponse.json({ slug: null, hasHostedSite: false });
  if (by !== "subdomain" && by !== "customDomain") {
    return NextResponse.json({ error: "Bad by param" }, { status: 400 });
  }

  // Canonicalize the host for custom-domain lookups: treat
  // www.luigis.com and luigis.com as the same tenant. Vercel
  // registers BOTH versions automatically when you add a domain,
  // so both hit our app — but we only store one canonical version
  // in Restaurant.customDomain (whatever the user typed). Strip
  // the leading "www." before the DB lookup so either hostname
  // resolves to the same restaurant row.
  const candidates =
    by === "customDomain"
      ? Array.from(new Set([value, value.replace(/^www\./, ""), `www.${value.replace(/^www\./, "")}`]))
      : [value];

  const where = by === "subdomain"
    ? { subdomain: value, isActive: true }
    : { customDomain: { in: candidates }, isActive: true, customDomainStatus: "verified" };

  const r = await prisma.restaurant.findFirst({
    where: where as any,
    select: { id: true, slug: true },
  });

  if (r) {
    // Resolve hosted-site entitlement so the middleware can branch the
    // root-path rewrite. hasFeature is fast (entitlements module caches the
    // active add-on rows per restaurant) but we still cache the result in the
    // middleware LRU so steady-state traffic avoids ever doing this lookup.
    const hasHostedSite = await hasFeature(r.id, "hosted_marketing_page");
    return NextResponse.json({ slug: r.slug, hasHostedSite });
  }

  // ── Reseller custom domain fallback ────────────────────────────────
  // Only applies when looking up by customDomain (resellers don't get
  // subdomains — that's a restaurant-only feature). We require BOTH the
  // custom domain to be verified AND the reseller's white-label
  // subscription to be active + on the Full tier (the $29 tier that
  // promises custom domain). If the subscription lapses, the domain
  // simply stops routing — they keep the Vercel binding but the proxy
  // 404s until they reactivate.
  if (by === "customDomain") {
    const reseller = await prisma.resellerProfile.findFirst({
      where: {
        // Same www/apex normalization as the restaurant lookup above —
        // Vercel routes both versions to our app; we match either.
        customDomain: { in: candidates },
        customDomainStatus: "verified",
        status: "approved",
        whiteLabelStatus: "active",
        whiteLabelTier: "full",
      },
      select: { id: true },
    });
    if (reseller) {
      return NextResponse.json({
        slug: null,
        hasHostedSite: false,
        resellerProfileId: reseller.id,
      });
    }
  }

  return NextResponse.json({ slug: null, hasHostedSite: false });
}

/**
 * POST /api/_internal/resolve-host?host=... — invalidate the upstream
 * middleware LRU entry for a host. The middleware in-memory cache is per
 * instance, so this is a hint, not a strong invalidation; relying on the 60s
 * positive TTL as the ceiling is fine.
 *
 * In practice, called by the admin domain UI after a save. Returns 200 even
 * when the cache is empty so callers don't need to handle a "miss" response.
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const headerKey = req.headers.get("x-internal-key");
    const expectedKey = process.env.INTERNAL_API_SECRET;
    if (!expectedKey || headerKey !== expectedKey) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  // The cache lives in the middleware module which we cannot touch from here
  // directly. This endpoint just returns success — TTL handles the rest.
  return NextResponse.json({ ok: true });
}
