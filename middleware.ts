import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Next.js middleware — runs at the edge BEFORE the route resolves.
 *
 * Used for one specific problem right now: when a superadmin (who has
 * no `restaurantId` — they're the platform operator, not a restaurant
 * owner) visits a restaurant-scoped admin path, we want to send them to
 * the SUPERADMIN equivalent of that page instead of dumping them at
 * the /superadmin dashboard. Otherwise clicking "Add-Ons" while
 * logged in as a superadmin looks like getting logged out (URL changes
 * to a completely different page, sidebar swaps, etc.).
 *
 * Why middleware instead of in-page redirects: Next.js layouts can't
 * easily see the requested pathname, and even if a child page handles
 * its own superadmin redirect, the AdminLayout runs first and would
 * bounce to /superadmin (the dashboard) before the child page's logic
 * gets a chance to fire. Middleware sees the pathname, so a single
 * place handles the mapping cleanly.
 *
 * Path-aware mapping:
 *   /admin/billing/add-ons  → /superadmin/add-ons
 *   /admin/billing/*        → /superadmin/billing
 *   /admin/*                → /superadmin   (catch-all dashboard)
 *
 * Restaurant admins are untouched — they pass straight through.
 */

const ADMIN_TO_SA: Array<{ match: RegExp; to: string }> = [
  // Most specific first.
  { match: /^\/admin\/billing\/add-ons(?:\/|$)/, to: "/superadmin/add-ons" },
  { match: /^\/admin\/billing(?:\/|$)/, to: "/superadmin/billing" },
  { match: /^\/admin\/locations(?:\/|$)/, to: "/superadmin/restaurants" },
  // Default — superadmin lands on their own dashboard.
  { match: /^\/admin(?:\/|$)/, to: "/superadmin" },
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only consider /admin/* paths. Everything else passes through.
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  // Read the NextAuth JWT directly so we don't need a DB call. The
  // session cookie name flips between secure / non-secure based on
  // NEXTAUTH_URL — getToken handles both. If `secret` mismatches,
  // getToken returns null and we fall through (the layout will then
  // do the right thing).
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  }).catch(() => null);

  // Not authed → let the page-level guard send them to /login.
  if (!token) return NextResponse.next();

  // Only superadmins get path-mapped. Restaurant admins, kitchen staff,
  // resellers etc. continue to their requested admin route normally.
  const role = (token as { role?: string }).role;
  if (role !== "superadmin") return NextResponse.next();

  // Superadmin requesting an /admin/* path → map to the superadmin
  // equivalent. We DON'T touch them if they're already heading to
  // /admin/* via an active impersonation cookie (sa_impersonate). The
  // impersonation flow legitimately wants superadmins on restaurant
  // admin pages.
  const impersonatingRestaurant = req.cookies.get("sa_impersonate")?.value;
  if (impersonatingRestaurant) return NextResponse.next();

  for (const { match, to } of ADMIN_TO_SA) {
    if (match.test(pathname)) {
      const url = req.nextUrl.clone();
      url.pathname = to;
      // Preserve search params so /admin/billing/add-ons?subscribed=1 keeps
      // its query string through the redirect.
      const res = NextResponse.redirect(url);
      // Belt-and-suspenders no-cache on auth-state-dependent redirects.
      // Browsers (especially Edge / Chromium) sometimes cache redirect
      // responses even though the spec says they shouldn't for 307s.
      // We were burned by exactly this: a user who hit /admin/billing/add-ons
      // before the bugfix was deployed had a cached "→ /login" redirect
      // that kept firing even AFTER the server-side fix landed, until they
      // cleared their browser cache. Setting these headers explicitly
      // means future redirect logic changes propagate immediately.
      res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      res.headers.set("Pragma", "no-cache");
      res.headers.set("Expires", "0");
      return res;
    }
  }

  return NextResponse.next();
}

export const config = {
  // Match all /admin paths. We don't bother with /superadmin (the
  // user's already where they're supposed to be), API routes, or
  // static assets.
  matcher: ["/admin/:path*"],
};
