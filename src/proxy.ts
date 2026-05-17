import { NextRequest, NextResponse } from "next/server";
import { decideHost } from "@/lib/domains/resolve";
import { getCached, setCached } from "@/lib/domains/lru";

/**
 * Host-based multi-tenant rewriter.
 *
 *   <PLATFORM_DOMAIN>            → marketing root (passthrough to /)
 *   app.<PLATFORM_DOMAIN>        → admin/kitchen console (passthrough)
 *   <sub>.<PLATFORM_DOMAIN>      → tenant ordering — rewrite to /order/<slug>/...
 *   <customDomain>               → tenant ordering — rewrite to /order/<slug>/...
 *
 * The rewrite preserves the user-facing URL (e.g. luigis.feefreeordering.com/info
 * keeps that address in the bar) while internally serving the existing
 * /order/[slug] route tree. No duplication of pages required.
 *
 * Configuration:
 *   PLATFORM_DOMAIN       — primary platform domain. Set to "localtest.me" in
 *                           local dev so `<sub>.localtest.me` resolves to
 *                           127.0.0.1 without any /etc/hosts edits.
 *   INTERNAL_API_SECRET   — shared secret for the resolve-host API.
 *
 * Performance: an in-process LRU absorbs the steady-state hit rate so we
 * almost never round-trip to the Node API. See lru.ts for caps + TTLs.
 */

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "localtest.me";

export const config = {
  // Apply to everything EXCEPT static assets, API routes, internal Next files,
  // and the surfaces that are explicitly part of the operator console / always
  // passthrough. The negative lookahead keeps the matcher cheap. /admin is
  // included so we can attach an x-pathname header (read by the admin layout
  // to power the subscription gate); the proxy logic itself passes admin
  // requests through without any rewrite.
  matcher: [
    "/((?!api|_next/|_static|kitchen|login|signup|features|pricing|demo|faq|icons|manifest-order.webmanifest|manifest-kitchen.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};

export async function proxy(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;

  // Operator console — pass through, but attach pathname header so the admin
  // layout's subscription gate can avoid redirect loops on /admin/billing.
  if (pathname.startsWith("/admin")) {
    const headers = new Headers(req.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  }

  const decision = decideHost({ host, platformDomain: PLATFORM_DOMAIN });

  if (decision.kind === "passthrough" || decision.kind === "marketing") {
    // Marketing decisions also pass through (the / route renders the marketing
    // landing page). We only rewrite for tenants.
    return NextResponse.next();
  }

  // decision.kind === "needs-lookup"
  const { lookupBy, value } = decision;
  const cacheKey = `${lookupBy}:${value}`;
  let slug: string | null;

  const cached = getCached(cacheKey);
  if (cached.hit) {
    slug = cached.slug;
  } else {
    try {
      const resolveUrl = new URL("/api/internal/resolve-host", req.url);
      resolveUrl.searchParams.set("by", lookupBy);
      resolveUrl.searchParams.set("value", value);
      const headers: HeadersInit = {};
      if (process.env.INTERNAL_API_SECRET) {
        headers["x-internal-key"] = process.env.INTERNAL_API_SECRET;
      }
      const res = await fetch(resolveUrl, { headers });
      const data = (await res.json()) as { slug: string | null };
      slug = data.slug ?? null;
      setCached(cacheKey, slug);
    } catch {
      // If the resolver is unreachable, fail open to the marketing page. This
      // matters because a transient resolver outage shouldn't 500 the whole
      // platform — a user landing on the marketing page is recoverable.
      return NextResponse.next();
    }
  }

  if (!slug) {
    // Host has no matching tenant. Send to a "host not found" page on the
    // marketing tree if we have one, otherwise fall back to the marketing root.
    // For now: rewrite to /not-found so Next renders its default 404.
    return NextResponse.rewrite(new URL("/not-found", req.url));
  }

  const { search } = req.nextUrl;
  const rewritten = new URL(`/order/${slug}${pathname}${search}`, req.url);

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);
  return NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
}
