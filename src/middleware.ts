import { NextRequest, NextResponse } from "next/server";

/**
 * Subdomain routing for the hosted marketing site (Phase 6).
 *
 * Behavior:
 *   - <slug>.feefreeordering.com  → rewrite to /site/<slug>
 *   - feefreeordering.com         → no-op (main marketing/admin site)
 *   - localhost / vercel preview  → no-op (so the dev flow keeps working)
 *
 * We intentionally do NOT rewrite for the apex domain or for "www"; only
 * the third-level subdomain of PLATFORM_DOMAIN counts. PlatformSettings
 * may override the domain via env var PLATFORM_DOMAIN.
 *
 * Routes excluded from rewriting (auth, api, static assets) are listed in
 * the matcher config at the bottom.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase().split(":")[0];
  const platformDomain = (process.env.PLATFORM_DOMAIN || "feefreeordering.com").toLowerCase();

  // Skip if not on platform domain at all (custom domains handled separately,
  // localhost, vercel previews, etc.)
  if (!host.endsWith(platformDomain)) return NextResponse.next();
  if (host === platformDomain) return NextResponse.next();
  if (host === `www.${platformDomain}`) return NextResponse.next();

  // Extract the subdomain — everything before .platformDomain
  const sub = host.slice(0, host.length - platformDomain.length - 1);
  // Reject anything with a dot (nested subdomains aren't customer pages)
  if (!sub || sub.includes(".")) return NextResponse.next();
  // Reserved prefixes that must NOT be rewritten (operator surfaces).
  const RESERVED = new Set(["app", "api", "admin", "kitchen", "superadmin", "embed"]);
  if (RESERVED.has(sub)) return NextResponse.next();

  // Rewrite — keep query string intact, push pathname into /site/<sub><pathname>
  const url = req.nextUrl.clone();
  // If user came to <slug>.domain/foo/bar, keep that subpath under the slug so
  // /menu, /reservations etc. can be reached relative to the marketing site.
  const subPath = url.pathname === "/" ? "" : url.pathname;
  url.pathname = `/site/${sub}${subPath}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip API, _next assets, favicon, static files. Catch everything else so
  // hosted-site subdomains hit the rewriter.
  matcher: ["/((?!api|_next|.*\\..*|favicon.ico).*)"],
};
