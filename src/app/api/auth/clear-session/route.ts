import { NextResponse } from "next/server";

/**
 * Force-clear every stale auth/session cookie a browser might still be
 * holding before a fresh login starts.
 *
 * Why this exists: we hit a bug 2026-05-22 where a user logged out of
 * the superadmin role, signed in as a restaurant_admin
 * (info@luigislasagna.com), and was still bounced to /superadmin because
 * a stale session cookie was in the browser. Manual cookie/cache clearing
 * fixed it, but no end user should have to do that.
 *
 * Each of the three login surfaces (/login, /kitchen/login,
 * /account/login) calls this endpoint as the FIRST thing in its submit
 * handler. By the time the actual signIn() / login POST fires, the
 * browser has a clean cookie jar — no risk of `getSessionUser()` picking
 * up the wrong session.
 *
 * What we clear:
 *   - next-auth.session-token + __Secure-next-auth.session-token   (admin/staff session)
 *   - next-auth.kitchen-session-token + __Secure- prefix variant   (kitchen device session)
 *   - ff_customer                                                  (customer/marketplace session)
 *   - sa_impersonate, partner_impersonate, sa_reseller_impersonate (any lingering impersonation)
 *   - next-auth.csrf-token + callback-url                          (NextAuth's own state — also stale post-logout)
 *
 * What we DON'T clear:
 *   - active_location  (legitimate multi-location context, no auth bearing)
 *   - locale / NEXT_LOCALE cookies (user preference, not auth)
 *   - Any non-prefixed app cookies the user might have
 *
 * Browser cookie deletion works by responding with Set-Cookie headers
 * that have an expired Max-Age and empty value. We have to repeat each
 * cookie under both the http-only (dev) and __Secure- (prod) prefixes
 * because the browser doesn't know which one is live.
 */

/** Cookie names that should be deleted on a fresh login attempt. */
const COOKIES_TO_CLEAR: string[] = [
  // NextAuth sessions — admin/staff
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  // NextAuth sessions — kitchen device
  "next-auth.kitchen-session-token",
  "__Secure-next-auth.kitchen-session-token",
  // NextAuth CSRF + callback state (gets stale after logout, can cause issues)
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
  // Customer/marketplace session
  "ff_customer",
  // Impersonation cookies (rare but possible to be stuck)
  "sa_impersonate",
  "partner_impersonate",
  "sa_reseller_impersonate",
];

export async function POST() {
  const res = NextResponse.json({ cleared: true });
  for (const name of COOKIES_TO_CLEAR) {
    // Set with an empty value + maxAge:0 to delete. Path "/" matches
    // how the cookies were originally set so the browser knows to
    // delete the right one.
    res.cookies.set({
      name,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      // secure flag has to match the original cookie's flag for the
      // browser to recognise it as the same cookie. Cookies set under
      // the __Secure- prefix were secure:true; others were secure-in-
      // prod-only. The safest blanket approach: emit each name twice —
      // once with secure:true, once without — so the browser deletes
      // whichever one is actually present. (Setting secure:true on an
      // HTTP origin is silently ignored, so this is safe.)
      secure: true,
    });
    res.cookies.set({
      name,
      value: "",
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    });
  }
  return res;
}
