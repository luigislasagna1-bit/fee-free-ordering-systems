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
    // Any path that contains a file extension we recognise as a static
    // asset is excluded outright — same defence the previous explicit
    // lists were trying to apply, but exhaustive instead of folder-by-
    // folder. We hit this exact bug twice in one day (Luigi 2026-06-01:
    // /promo-stock/*.svg, then /promo-defaults/*.svg) because the proxy
    // was rewriting tenant-bound paths over real static files in
    // public/. The negative-lookahead below skips static-file-shaped
    // URLs even if they live in folders we haven't named yet (e.g.
    // future /icons/, /promo-foo/, /assets/ additions).
    //
    // Plus the original named exclusions for paths that don't carry a
    // file extension but should still skip the proxy (api, _next,
    // service worker, PWA manifests).
    "/((?!api|_next/|_static|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|css|js|mjs|woff2?|ttf|eot|map|json|txt|xml|mp3|wav|ogg|mp4|webm|pdf)$|manifest-order.webmanifest|manifest-kitchen.webmanifest|sw\\.js|offline\\.html|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
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
      // Keep the FULL /marketplace[/...] path on the marketplace domain. The
      // marketplace app serves the grid at /marketplace and restaurant detail
      // at /marketplace/<slug> — matching the sitemap (buildMarketplaceSitemap)
      // and the grid tile links. The previous code STRIPPED the /marketplace
      // prefix, producing feefreefood.com/<slug>, which has no route and 404s.
      // That was the dead "View your live listing" link. Luigi 2026-06-04.
      const url = new URL(
        `https://${MARKETPLACE_DOMAIN}${pathname}${req.nextUrl.search}`
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
  let hasHostedSite = false;
  let resellerProfileId: string | null = null;
  let customDomainActive = true;
  let tenantSubdomain: string | null = null;

  const cached = getCached(cacheKey);
  if (cached.hit) {
    slug = cached.info.slug;
    hasHostedSite = cached.info.hasHostedSite;
    resellerProfileId = cached.info.resellerProfileId ?? null;
    customDomainActive = cached.info.customDomainActive ?? true;
    tenantSubdomain = cached.info.subdomain ?? null;
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
      const data = (await res.json()) as { slug: string | null; hasHostedSite?: boolean; resellerProfileId?: string | null; customDomainActive?: boolean; subdomain?: string | null };
      slug = data.slug ?? null;
      hasHostedSite = !!data.hasHostedSite;
      resellerProfileId = data.resellerProfileId ?? null;
      customDomainActive = data.customDomainActive ?? true;
      tenantSubdomain = data.subdomain ?? null;
      setCached(cacheKey, { slug, hasHostedSite, resellerProfileId, customDomainActive, subdomain: tenantSubdomain });
    } catch {
      // If the resolver is unreachable, fail open to the marketing page. This
      // matters because a transient resolver outage shouldn't 500 the whole
      // platform — a user landing on the marketing page is recoverable.
      return NextResponse.next();
    }
  }

  // ── Reseller branded domain branch ─────────────────────────────────
  // The host matched a reseller's verified+active customDomain OR
  // genericSubdomain (no restaurant). Two cases:
  //
  //   a) UNAUTHENTICATED → rewrite ALL paths to /login?reseller=<id>
  //      so any URL someone types on `partner.com/...` lands on the
  //      branded login. The login form then enforces strict scope —
  //      only users belonging to this reseller (their admin / their
  //      restaurants / their staff) can authenticate.
  //
  //   b) AUTHENTICATED → pass through so the reseller's admin and
  //      their restaurants' admin/kitchen/etc. work fully on the
  //      branded domain. Without this branch, post-login navigation
  //      would bounce back to /login (because we'd rewrite /admin →
  //      /login), making the branded domain login-only and effectively
  //      unusable. We trust the JWT we just decoded — the scope check
  //      happened during sign-in.
  //
  // Note: the auth check uses the same getToken() we already imported
  // for the superadmin admin→superadmin remap above, so no extra
  // dependency added.
  if (resellerProfileId && !slug) {
    let isAuthed = false;
    try {
      const t = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
      isAuthed = !!t;
    } catch {
      // Treat JWT decode failure as unauthenticated — safer to show the
      // login than to silently let through someone with a malformed
      // session cookie.
    }

    if (isAuthed) {
      // Pass through, tagging the request with the branded host's reseller
      // id so downstream layouts (admin sidebar, headers) can keep the
      // branding cohesive across the full app surface.
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-reseller-profile-id", resellerProfileId);
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // Carve-out: branded SIGNUP + account-recovery pages stay on their own
    // route so a reseller's host can host a full account-lifecycle flow, not
    // just login. Everything else still funnels to the branded login below.
    // /forgot-password, /reset-password and /verify-email are part of the
    // signup/recovery surface, so they all rewrite to the branded /signup
    // (the page itself routes between sign-up and recovery sub-views).
    const isSignupSurface =
      pathname === "/signup" ||
      pathname === "/forgot-password" ||
      pathname === "/reset-password" ||
      pathname === "/verify-email";
    const targetUrl = new URL(isSignupSurface ? `/signup` : `/login`, req.url);
    targetUrl.searchParams.set("reseller", resellerProfileId);
    // Preserve any callbackUrl the caller wanted (so a deep-link works).
    const original = req.nextUrl.searchParams.get("callbackUrl");
    if (original) targetUrl.searchParams.set("callbackUrl", original);
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-reseller-profile-id", resellerProfileId);
    return NextResponse.rewrite(targetUrl, { request: { headers: requestHeaders } });
  }

  if (!slug) {
    // Host has no matching tenant. Send to a "host not found" page on the
    // marketing tree if we have one, otherwise fall back to the marketing root.
    // For now: rewrite to /not-found so Next renders its default 404.
    return NextResponse.rewrite(new URL("/not-found", req.url));
  }

  // ── Lapsed Custom Domain → redirect to the free platform link ──────
  // The host matched only because customDomain + customDomainStatus are still
  // on the row, but the Custom Domain add-on (custom_domain_routing) has
  // lapsed. Don't keep serving the paid vanity domain — but DON'T 404 either:
  // real diners type this URL, so a dead page would cost the restaurant
  // orders. 302-redirect to the restaurant's FREE link — their
  // <subdomain>.<platform> if set (its proxy prefixes /order/<slug>
  // identically, so the path carries over 1:1), else <platform>/order/<slug>
  // with the internal path resolved so deep links still land. Entitlement-
  // dependent, so the redirect must never be cached (AGENTS.md). Mirrors the
  // reseller-domain lapse behavior, just gentler (redirect vs 404).
  if (lookupBy === "customDomain" && !customDomainActive) {
    const qs = req.nextUrl.search;
    let target: URL;
    if (tenantSubdomain) {
      target = new URL(`https://${tenantSubdomain}.${PLATFORM_DOMAIN}${pathname}${qs}`);
    } else {
      const internalPath =
        pathname === "/" || pathname === ""
          ? `/order/${slug}`
          : pathname === `/order/${slug}` ||
              pathname.startsWith(`/order/${slug}/`) ||
              pathname === `/site/${slug}` ||
              pathname.startsWith(`/site/${slug}/`)
            ? pathname
            : `/order/${slug}${pathname}`;
      target = new URL(`https://${PLATFORM_DOMAIN}${internalPath}${qs}`);
    }
    const res = NextResponse.redirect(target, 302);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  }

  const { search } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-tenant-slug", slug);

  // Root path → hosted-site customers see their marketing page; everyone
  // else lands directly on their order page. The hosted-site customer's
  // marketing page renders an "Order Online" button pointing at
  // /order/<slug>, which the next branch handles cleanly.
  if (pathname === "/" || pathname === "") {
    const targetPath = hasHostedSite ? `/site/${slug}` : `/order/${slug}`;
    return NextResponse.rewrite(new URL(`${targetPath}${search}`, req.url), {
      request: { headers: requestHeaders },
    });
  }

  // Paths that already reference THIS tenant under our internal route
  // structure pass through unchanged (modulo the rewrite mechanism). Without
  // this, /order/<slug>/info on a subdomain would double-prefix to
  // /order/<slug>/order/<slug>/info. Restricted to the SAME slug so a
  // malicious "<tenantA>.feefreeordering.com/order/tenantB" can't be used
  // to serve tenant B's page from tenant A's subdomain.
  if (
    pathname === `/order/${slug}` ||
    pathname.startsWith(`/order/${slug}/`) ||
    pathname === `/site/${slug}` ||
    pathname.startsWith(`/site/${slug}/`)
  ) {
    return NextResponse.rewrite(new URL(`${pathname}${search}`, req.url), {
      request: { headers: requestHeaders },
    });
  }

  // For hosted-site customers, ALL single-segment paths under the
  // subdomain that match the {cuisine}-{type}-{city} shape go to the
  // programmatic-SEO landing page at /site/<slug>/<seoSlug>. The shape
  // we detect: contains `-delivery-` or `-takeout-` somewhere in the
  // path. The landing page itself validates whether the slug matches
  // a real keyword combo for this restaurant; bogus slugs 404 cleanly.
  // This is what turns hidden footer links like
  // <slug>.feefreeordering.com/italian-food-delivery-mississauga
  // into actual indexable landing pages without us having to maintain
  // a static list of routes — every cuisine × city permutation works.
  if (
    hasHostedSite &&
    /^\/[a-z0-9-]+$/.test(pathname) &&
    (pathname.includes("-delivery-") || pathname.includes("-takeout-"))
  ) {
    const seoSlug = pathname.slice(1);
    return NextResponse.rewrite(new URL(`/site/${slug}/${seoSlug}${search}`, req.url), {
      request: { headers: requestHeaders },
    });
  }

  // Default for non-root paths: tenant-route by prefixing /order/<slug>.
  // Preserves the existing behavior for sub-paths like /info, /payment, etc.
  const rewritten = new URL(`/order/${slug}${pathname}${search}`, req.url);
  return NextResponse.rewrite(rewritten, { request: { headers: requestHeaders } });
}
