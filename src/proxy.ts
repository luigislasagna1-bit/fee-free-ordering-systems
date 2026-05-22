import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { decideHost } from "@/lib/domains/resolve";
import { getCached, setCached } from "@/lib/domains/lru";

/**
 * For a superadmin requesting /admin/*, send them to the equivalent
 * /superadmin/* page instead of dropping them at the dashboard. Without
 * this mapping, clicking "Add-Ons" while logged in as a superadmin
 * looks like getting logged out (URL changes drastically, sidebar swaps
 * to a different chrome). With this mapping they land on the matching
 * superadmin page and the transition feels natural.
 *
 * Path-specific mappings first, then a fallback to /superadmin root.
 */
const ADMIN_TO_SUPERADMIN: Array<{ match: RegExp; to: string }> = [
  { match: /^\/admin\/billing\/add-ons(?:\/|$)/, to: "/superadmin/add-ons" },
  { match: /^\/admin\/billing(?:\/|$)/, to: "/superadmin/billing" },
  { match: /^\/admin\/locations(?:\/|$)/, to: "/superadmin/restaurants" },
  { match: /^\/admin(?:\/|$)/, to: "/superadmin" },
];

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
const MARKETPLACE_DOMAIN = process.env.MARKETPLACE_DOMAIN || "";

/**
 * Paths that ONLY make sense on the primary platform (admin/kitchen/auth/etc).
 * If a customer somehow lands on the marketplace domain at one of these paths,
 * we 301 them to the same path on PLATFORM_DOMAIN so they can sign in / use
 * the admin console / etc. Customer-facing paths (/, /marketplace/*, /order/*,
 * /api/*, /embed/*) are NOT in this list — they should work on either domain.
 */
const PRIMARY_ONLY_PREFIXES = [
  "/admin",
  "/superadmin",
  "/kitchen",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/reseller",
  "/partners",
  "/pricing",
  "/features",
  "/faq",
  "/demo",
  "/site",
];

export const config = {
  // Apply to everything EXCEPT static assets, API routes, internal Next files,
  // and the surfaces that are explicitly part of the operator console / always
  // passthrough. The negative lookahead keeps the matcher cheap. /admin is
  // included so we can attach an x-pathname header (read by the admin layout
  // to power the subscription gate); the proxy logic itself passes admin
  // requests through without any rewrite.
  // Excluded paths are pure infra/asset URLs that never benefit from host
  // routing. Auth/marketing/console paths (login, signup, kitchen, etc.)
  // DO go through the proxy so we can redirect them off the marketplace
  // domain back to PLATFORM_DOMAIN.
  matcher: [
    "/((?!api|_next/|_static|icons|manifest-order.webmanifest|manifest-kitchen.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};

export async function proxy(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;

  // Operator console — two cases:
  //
  //  a) Superadmin with no active impersonation → path-map to the
  //     equivalent /superadmin/* page. Otherwise clicking "Add-Ons" or
  //     "Billing" in any admin context bounces them to /superadmin
  //     (dashboard) which feels like getting logged out. Mapping
  //     specifically (e.g. /admin/billing/add-ons → /superadmin/add-ons)
  //     keeps the transition coherent.
  //
  //  b) Anyone else → pass through, attaching the x-pathname header so
  //     the admin layout's subscription gate can avoid redirect loops
  //     on /admin/billing.
  if (pathname.startsWith("/admin")) {
    try {
      const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      const role = (token as { role?: string } | null)?.role;
      const impersonatingRestaurant = req.cookies.get("sa_impersonate")?.value;
      if (role === "superadmin" && !impersonatingRestaurant) {
        for (const { match, to } of ADMIN_TO_SUPERADMIN) {
          if (match.test(pathname)) {
            const url = req.nextUrl.clone();
            url.pathname = to;
            const res = NextResponse.redirect(url);
            // Auth-state-dependent redirects must not be cached by the
            // browser — a stale cached redirect after fix changes
            // causes lockouts (we hit this exact bug, see AGENTS.md).
            res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
            res.headers.set("Pragma", "no-cache");
            res.headers.set("Expires", "0");
            return res;
          }
        }
      }
    } catch {
      // If JWT decoding fails (e.g. NEXTAUTH_SECRET mismatch at the edge),
      // fall through to the normal passthrough rather than 500ing the
      // whole admin tree.
    }
    const headers = new Headers(req.headers);
    headers.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers } });
  }

  const decision = decideHost({
    host,
    platformDomain: PLATFORM_DOMAIN,
    marketplaceDomain: MARKETPLACE_DOMAIN || undefined,
  });

  // Marketing & passthrough — but first, on the primary platform domain we
  // 301 any /marketplace[/...] hit over to MARKETPLACE_DOMAIN so there's one
  // canonical URL for marketplace content (SEO + bookmark cleanliness).
  if (decision.kind === "passthrough" || decision.kind === "marketing") {
    if (
      decision.kind === "marketing" &&
      MARKETPLACE_DOMAIN &&
      pathname.startsWith("/marketplace")
    ) {
      const url = new URL(
        `https://${MARKETPLACE_DOMAIN}${pathname === "/marketplace" ? "/" : pathname.replace(/^\/marketplace/, "")}${req.nextUrl.search}`
      );
      const res = NextResponse.redirect(url, 301);
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.headers.set("Pragma", "no-cache");
      res.headers.set("Expires", "0");
      return res;
    }
    return NextResponse.next();
  }

  // Marketplace domain — feefreefood.com (apex or www).
  //
  // Goal: customer experience is END-TO-END on this domain — discover on /,
  // restaurant detail at /<slug-routed-through-/marketplace>, ordering on
  // /order/<slug>/* — but admin/auth/console routes redirect to the primary
  // platform so staff don't get lost.
  if (decision.kind === "marketplace") {
    // Bounce primary-only paths back to PLATFORM_DOMAIN.
    if (PRIMARY_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      const url = new URL(`https://${PLATFORM_DOMAIN}${pathname}${req.nextUrl.search}`);
      const res = NextResponse.redirect(url, 302);
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.headers.set("Pragma", "no-cache");
      res.headers.set("Expires", "0");
      return res;
    }
    // Marketplace homepage — rewrite "/" to the existing /marketplace route
    // so we don't have to duplicate the grid component.
    if (pathname === "/" || pathname === "") {
      return NextResponse.rewrite(new URL("/marketplace", req.url));
    }
    // Everything else (/marketplace/*, /order/*, /api/*, /embed/*, static)
    // passes through. The customer sees feefreefood.com in the URL bar the
    // whole time.
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
