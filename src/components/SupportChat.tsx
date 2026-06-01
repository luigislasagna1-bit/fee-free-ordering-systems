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
 * If either env is unset the widget no-ops — safe to mount globally
 * before Luigi has registered with Tawk.
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

const HIDE_PREFIXES = ["/order/", "/kitchen/", "/superadmin/", "/embed/"];

declare global {
  interface Window {
    Tawk_API?: {
      hideWidget?: () => void;
      showWidget?: () => void;
      onLoad?: () => void;
    };
    Tawk_LoadStart?: Date;
  }
}

function shouldHide(pathname: string | null): boolean {
  if (!pathname) return false;
  return HIDE_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p));
}

export function SupportChat() {
  const pathname = usePathname();
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID;
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID || "default";

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
    const id = "tawk-loader";
    if (!document.getElementById(id)) {
      const s = document.createElement("script");
      s.id = id;
      s.async = true;
      s.src = `https://embed.tawk.to/${propertyId}/${widgetId}`;
      s.charset = "UTF-8";
      s.setAttribute("crossorigin", "*");
      document.head.appendChild(s);
    }
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
