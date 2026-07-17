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
 * SHOW on:
 *   - Marketing pages (/, /pricing, /signup, /login, etc.)
 *   - /admin/*      (signed-in restaurants — setup / billing help)
 *   - /reseller/*   (signed-in resellers — partner support)
 *
 * HIDE on:
 *   - /order/*      (customer-facing ordering pages — we don't want
 *                    pizza customers asking Luigi about their order;
 *                    that's the restaurant owner's job)
 *   - /site/*       (the restaurant's own hosted marketing site —
 *                    same reason: it's the diner's view, not ours)
 *   - any branded host (custom domain / <slug>.<platform> subdomain) —
 *                    the proxy rewrites "/" so the path can't reveal it;
 *                    see isBrandedHost() below
 *   - /kitchen/*    (busy staff screens — a floating bubble covers
 *                    incoming order tickets)
 *   - /superadmin/* (Luigi's own dashboard — no point messaging himself)
 *   - /embed/*      (embedded widgets pasted onto third-party sites —
 *                    we don't want our chat appearing on their pages)
 *
 * The hide is enforced two ways: (1) we don't INJECT the script when
 * the path is hidden, (2) we call Tawk_API.hideWidget() on subsequent
 * client-side navigations into hidden routes. That way a single-page
 * navigation from /admin → /admin/orders → /order/[slug] reliably
 * hides the bubble when it lands on the customer page.
 */

const HIDE_PREFIXES = ["/order/", "/site/", "/kitchen/", "/superadmin/", "/embed/", "/driver/"];

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
 * "/order/[slug]" or "/site/[slug]", so usePathname() reports "/" and the
 * path-based HIDE_PREFIXES never match — which is why the chat leaked onto
 * customer ordering pages served on custom domains (Luigi 2026-06-15).
 * Those hosts only ever serve customer-facing pages, so the support chat is
 * hidden on ALL of them. The platform apex, www, the app subdomain, and the
 * marketplace domain (marketing / admin / reseller / marketplace) still show it.
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
 * Inside ANY native app shell (Kitchen / Fee Free Delivery — Capacitor WebViews
 * of this site) the support chat must NEVER appear, on any route (Luigi
 * 2026-07-16: the bubble showed up in the iOS driver app, and the in-app
 * "Restaurant owner?" flow passes through /login where the web rightly shows
 * it). Capacitor injects window.Capacitor into remote-URL shells, so this is
 * reliable even though the apps load the live site.
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
  if (!pathname) return false;
  return HIDE_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
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
