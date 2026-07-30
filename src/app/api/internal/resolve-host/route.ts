import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { hostCandidates } from "@/lib/domains/host-candidates";

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
  // Shared with the connect/claim routes via hostCandidates() — the two MUST
  // agree on what counts as "the same domain" (see host-candidates.ts).
  const candidates = by === "customDomain" ? hostCandidates(value) : [value];

  const where = by === "subdomain"
    ? { subdomain: value, isActive: true }
    : { customDomain: { in: candidates }, isActive: true, customDomainStatus: "verified" };

  const r = await prisma.restaurant.findFirst({
    where: where as any,
    select: { id: true, slug: true, subdomain: true },
  });

  // ── Zero-downtime domain switch (2026-07-30) ───────────────────────
  // NOTE: we deliberately DO NOT serve `pendingCustomDomain` here.
  //
  // An earlier draft did, to make a switched-to domain answer the instant its
  // DNS landed. That was a cross-tenant HIJACK vector: pendingCustomDomain
  // carries NO ownership proof (anyone with the add-on can park any string in
  // it), and this resolver matches apex+www as one identity while the connect
  // pre-check matched exactly — so tenant A could park "www.victim.com",
  // and once the real owner pointed victim.com here but before their own
  // domain reached "verified", A's storefront (and A's Stripe account) would
  // answer on the victim's domain. Found by adversarial review before ship.
  //
  // Zero-downtime does not need this branch: it is guaranteed by never
  // touching the LIVE customDomain until verify-custom's cutover, which
  // fires on exactly the same condition that would have made a pending
  // domain safe to serve (provider-confirmed ownership AND routing).

  // A PREVIOUS domain (pre-cutover) 308s to the new live domain with the
  // path preserved, so printed QR codes and old links keep working forever.
  // Safe by construction: previousCustomDomain is only ever written by the
  // cutover, from a customDomain that was already provider-verified.
  if (!r && by === "customDomain") {
    const prev = await prisma.restaurant.findFirst({
      where: { previousCustomDomain: { in: candidates }, isActive: true, customDomain: { not: null } },
      select: { customDomain: true },
    });
    if (prev?.customDomain) {
      return NextResponse.json({ slug: null, hasHostedSite: false, redirectToHost: prev.customDomain });
    }
  }

  if (r) {
    // Resolve hosted-site entitlement so the middleware can branch the
    // root-path rewrite. hasFeature is fast (entitlements module caches the
    // active add-on rows per restaurant) but we still cache the result in the
    // middleware LRU so steady-state traffic avoids ever doing this lookup.
    const hasHostedSite = await hasFeature(r.id, "hosted_marketing_page");
    // A CUSTOM DOMAIN only keeps routing while the Custom Domain add-on
    // (custom_domain_routing) is active. The row stays (customDomain +
    // verified) after the add-on lapses — connecting is gated, but continued
    // routing was not, so the domain used to serve for free forever. We now
    // flag the lapse so the proxy 302-redirects to the free platform link
    // instead (NOT a 404 — real diners type this URL). Subdomain hits are
    // free, so they're always "active". Mirrors the reseller domain check.
    const customDomainActive =
      by === "customDomain" ? await hasFeature(r.id, "custom_domain_routing") : true;
    return NextResponse.json({
      slug: r.slug,
      hasHostedSite,
      customDomainActive,
      subdomain: r.subdomain ?? null,
    });
  }

  // ── Reseller GENERIC subdomain fallback ────────────────────────────
  // Restaurants take precedence — if no restaurant matched the subdomain
  // label, we then check whether a reseller has claimed it as their
  // generic-subdomain branded login URL (e.g. acme.feefreeordering.com).
  // Requires an active white-label sub on EITHER tier — once they stop
  // paying, the branded URL stops resolving even though the row stays
  // (so resubscribing instantly restores it without re-claiming the
  // slug).
  if (by === "subdomain") {
    const reseller = await prisma.resellerProfile.findFirst({
      where: {
        genericSubdomain: value,
        status: "approved",
        whiteLabelStatus: "active",
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
