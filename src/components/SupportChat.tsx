"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Tawk.to support chat widget loader.
 *
 * Mirrors the GloriaFood / TimeTailor support UX — a floating chat
 * bubble bottom-right that lets potential customers, signed-up
 * restaurants, and resellers DM ownership for setup / sales / support
 * questions. Messages buzz Luigi's phone via the Tawk mobile app and
 * land in his Tawk dashboard inbox; Tawk also relays unanswered
 * messages to his email so nothing slips through when he's offline.
 *
 * Driven entirely by env vars:
 *   NEXT_PUBLIC_TAWK_PROPERTY_ID  — the property id from the Tawk
 *                                   dashboard (looks like a long
 *                                   alphanumeric string)
 *   NEXT_PUBLIC_TAWK_WIDGET_ID    — the widget id (usually "default"
 *                                   or "1abcdef234")
 *
 * The IDs default to Fee Free's own Tawk property (baked in below — they're
 * public anyway, shipping in the client embed); an env var overrides if the
 * property is ever moved.
 *
 * ── Where it shows / hides ──────────────────────────────────────────
 * This is an ALLOWLIST — the chat is OFF everywhere by default and only
 * turns on for the handful of routes named below (Luigi 2026-08-18: it had
 * spread across every marketing / SEO / legal / auth page; he wants it on a
 * couple of main pages plus signed-in accounts, nothing else).
 *
 * SHOW on — and ONLY on:
 *   - "/"           (the marketing homepage — top-of-funnel sales chat)
 *   - "/pricing"    (the highest-intent pre-sale page)
 *   - /admin/**     (signed-in restaurants — setup / billing help)
 *   - /reseller/**  (signed-in resellers — partner support)
 *
 * Everything else is HIDDEN, including all the pages that used to show it:
 * /features, /faq, /demo, /partners, /signup, /login, /register, the
 * password + email-verification flows, /privacy, /terms, /refund, /account*,
 * /import, /nabil-ai, /never-miss-an-order, /gloriafood-alternative, and the
 * whole SEO surface (/for/*, /vs/*, /online-ordering-for/*,
 * /ai-phone-ordering-for/*, /[slug]). Also still hidden, as before:
 *   - /order/*, /site/*, /marketplace*  (customer / diner surfaces)
 *   - /kitchen/*, /driver/*             (busy staff + driver screens)
 *   - /superadmin/*                     (Luigi messaging himself)
 *   - /embed/*                          (widgets on third-party sites)
 *   - the marketplace host (feefreefood.com / www) and ANY branded host —
 *     see isMarketplaceHost() / isBrandedHost() below. These host checks run
 *     BEFORE the path allowlist and are now load-bearing: those hosts rewrite
 *     "/" at the edge, so their pathname reads as "/" and would otherwise
 *     match the homepage entry and leak the chat onto a diner's page.
 *   - any native app shell (Kitchen / Driver Capacitor WebViews)
 *
 * To change which marketing pages carry the chat, edit SHOW_EXACT_PATHS —
 * that one array is the whole switch.
 *
 * The hide is enforced two ways: (1) we don't INJECT the script when
 * the path isn't allowed, (2) we call Tawk_API.hideWidget() on subsequent
 * client-side navigations into hidden routes. That way a single-page
 * navigation from /admin → /admin/orders → /order/[slug] reliably
 * hides the bubble when it lands on the customer page.
 */

/**
 * Public pages that carry the chat. EXACT matches only — no prefix matching,
 * so "/pricing" never drags in a future "/pricing-guide".
 */
const SHOW_EXACT_PATHS = ["/", "/pricing"];

/**
 * Signed-in account areas that carry the chat. Matched as the exact path OR
 * the path + "/" — NOT a bare startsWith, which would also swallow unrelated
 * siblings like "/reseller-reports".
 */
const SHOW_PREFIXES = ["/admin", "/reseller"];

declare global {
  interface Window {
    Tawk_API?: {
      hideWidget?: () => void;
      showWidget?: () => void;
      minimize?: () => void;
      onLoad?: () => void;
    };
    Tawk_LoadStart?: Date;
  }
}

/**
 * Branded-host detection (client mirror of isBrandedHost in
 * src/app/order/[slug]/page.tsx). On a custom domain or a
 * <slug>.<platform> subdomain the edge proxy REWRITES "/" →
 * "/order/[slug]" or "/site/[slug]", so usePathname() reports "/" — which is
 * why the chat leaked onto customer ordering pages served on custom domains
 * (Luigi 2026-06-15). Under the allowlist this matters MORE, not less: "/" is
 * now an explicitly allowed path, so without this host check every branded
 * customer domain would show the bubble on its storefront.
 * Those hosts only ever serve customer-facing pages, so the support chat is
 * hidden on ALL of them. Only the platform apex, www, and the app subdomain get
 * as far as the path allowlist above.
 */
function isBrandedHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (!host || host.startsWith("localhost") || host.startsWith("127.0.0.1")) return false;
  const platformDomain = (process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "feefreeordering.com").toLowerCase();
  const marketplaceDomain = (process.env.NEXT_PUBLIC_MARKETPLACE_DOMAIN || "feefreefood.com").toLowerCase();
  return (
    host !== platformDomain &&
    host !== `www.${platformDomain}` &&
    host !== marketplaceDomain &&
    host !== `www.${marketplaceDomain}` &&
    host !== `app.${platformDomain}`
  );
}

/**
 * The consumer marketplace host (feefreefood.com / www). Its apex serves the
 * /marketplace experience via an edge rewrite, so usePathname() reports "/",
 * which is an allowlisted path — the chat is for restaurants/resellers, not
 * diners browsing the marketplace, so hide it on the whole host
 * (Luigi 2026-08-03).
 */
function isMarketplaceHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (!host) return false;
  const marketplaceDomain = (process.env.NEXT_PUBLIC_MARKETPLACE_DOMAIN || "feefreefood.com").toLowerCase();
  return host === marketplaceDomain || host === `www.${marketplaceDomain}`;
}

/**
 * Inside ANY native app shell (Kitchen / Fee Free Delivery — Capacitor WebViews
 * of this site) the support chat must NEVER appear, on any route (Luigi
 * 2026-07-16: the bubble showed up in the iOS driver app). Capacitor injects
 * window.Capacitor into remote-URL shells, so this is reliable even though the
 * apps load the live site — and it still guards /admin, which the shells can
 * reach and which the path allowlist otherwise permits.
 */
function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as any).Capacitor;
    return !!cap && (typeof cap.isNativePlatform === "function" ? cap.isNativePlatform() : !!cap.isNative);
  } catch {
    return false;
  }
}

function shouldHide(pathname: string | null): boolean {
  // Native app shells never show the chat, regardless of route.
  if (isNativeShell()) return true;
  // Branded customer hosts next — the proxy rewrites "/" so the path alone
  // can't tell us we're on a customer page (see isBrandedHost above).
  if (isBrandedHost()) return true;
  // The marketplace host serves diners, not restaurants/resellers — hide the
  // chat on the whole host (its apex is a "/" → /marketplace rewrite).
  if (isMarketplaceHost()) return true;
  // Allowlist from here down: unknown/absent path fails CLOSED (hidden).
  if (!pathname) return true;
  // Tolerate a trailing slash ("/pricing/" -> "/pricing"); "/" stays "/".
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  if (SHOW_EXACT_PATHS.includes(path)) return false;
  if (SHOW_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return false;
  return true;
}

export function SupportChat() {
  const pathname = usePathname();
  // Fee Free's Tawk.to support property (Luigi 2026-06-14). Public IDs, so baked
  // in as the default — the widget works with no Vercel env setup; env overrides.
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID || "6a2f49dbccc4ac1d4891bee5";
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || "1jr4bh0k0";

  useEffect(() => {
    // No env wired up yet → bail. Component is safe to render before
    // Luigi has set the Vercel env vars.
    if (!propertyId) return;
    // Hidden route on first load → don't inject the script at all.
    if (shouldHide(pathname)) return;

    // Tawk's loader stamps Tawk_API and Tawk_LoadStart on window then
    // appends a <script> to <head>. We replicate their snippet inline
    // so we control the URL — keeps us safe from SRI changes and means
    // we don't need to render a <Script> from next/script.
    if (!window.Tawk_API) {
      window.Tawk_API = {};
      window.Tawk_LoadStart = new Date();
    }
    // Boot the widget MINIMIZED so it never restores into a maximized state from
    // a prior session's cookie.
    window.Tawk_API.onLoad = function () {
      try {
        window.Tawk_API?.minimize?.();
      } catch {
        /* Tawk not ready / method missing — safe to ignore */
      }
    };

    const id = "tawk-loader";
    if (document.getElementById(id)) return; // already injected (e.g. SPA nav)

    // LAZY-LOAD the chat — only inject Tawk after the visitor's first interaction
    // (or a short fallback timeout). Two reasons:
    //   1) MOBILE BUG FIX: a Tawk dashboard "proactive greeting" trigger pops a
    //      ~350px "👋 Welcome…" panel a beat after the script loads. On a phone
    //      that panel sits on top of the hero CTAs ("Start free" / "See a live
    //      storefront") and eats taps, so visitors literally couldn't reach
    //      signup. Deferring injection means the landing screen has NO chat iframe
    //      at all, so the above-the-fold CTAs are directly clickable; the very
    //      first tap on a CTA navigates away before Tawk ever loads.
    //      (The greeting itself is best scoped to desktop-only in the Tawk
    //      dashboard → Messaging ▸ Triggers — but this keeps mobile safe
    //      regardless.) (Luigi 2026-06-20)
    //   2) Faster first paint — no third-party JS in the critical path.
    let injected = false;
    const inject = () => {
      if (injected) return;
      injected = true;
      cleanup();
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
      s.charset = "UTF-8";
      s.setAttribute("crossorigin", "*");
      document.head.appendChild(s);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "touchstart", "scroll", "keydown", "mousemove"];
    const onIntent = () => inject();
    events.forEach((e) => window.addEventListener(e, onIntent, { once: true, passive: true }));
    const timer = window.setTimeout(inject, 12000);
    function cleanup() {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onIntent));
    }
    return cleanup;
  }, [propertyId, widgetId, pathname]);

  // On every client-side navigation, toggle visibility based on the
  // current path. Catches restaurants who navigate from /admin into
  // /order/<slug>/preview without a full page reload.
  useEffect(() => {
    if (!propertyId) return;
    const api = window.Tawk_API;
    if (!api) return;
    if (shouldHide(pathname)) {
      api.hideWidget?.();
    } else {
      api.showWidget?.();
    }
  }, [pathname, propertyId]);

  return null;
}
