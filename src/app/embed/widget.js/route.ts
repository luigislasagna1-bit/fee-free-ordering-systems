/**
 * Public widget loader. A restaurant pastes the snippet
 *
 *   <script src="https://feefreeordering.com/embed/widget.js"
 *           data-restaurant="wgt_xxx" async defer></script>
 *
 * into their existing site. This script auto-inserts a launcher button
 * that opens the ordering iframe at `/embed/widget/<publicId>`.
 *
 * Returned as plain JS (text/javascript) — no Next.js page wrapper.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-static"; // safe to cache; no per-request state

const SCRIPT = `(function(){
  try {
    var s = document.currentScript;
    var publicId = s && s.getAttribute("data-restaurant");
    if (!publicId) {
      console.warn("[FeeFreeOrdering] data-restaurant attribute missing on widget script");
      return;
    }
    var base = (function(){
      try { return new URL(s.src).origin; } catch (e) { return ""; }
    })();
    var btnLabel = (s && s.getAttribute("data-label")) || "See MENU & Order";
    var btnColor = (s && s.getAttribute("data-color")) || "#ef4444";
    // data-target="#some-id" lets the restaurant pin the button inline
    // wherever they want on their page (e.g. inside their nav). Without
    // it, we fall back to the floating bottom-right launcher.
    var targetSel = s && s.getAttribute("data-target");

    // Install-detection heartbeat. Fire exactly ONCE per page session.
    // Uses sendBeacon (which sends an HTTP POST) — the heartbeat endpoint
    // accepts BOTH POST and GET so it survives the sendBeacon transport
    // without 405s. Fire-and-forget; we never block on it. (Earlier bug:
    // server was GET-only, so sendBeacon hit 405 silently and
    // widgetInstalledAt stayed null even when the widget was clearly
    // live on a host page.)
    try {
      var beaconUrl = base + "/api/widget/heartbeat?id=" + encodeURIComponent(publicId);
      if (navigator.sendBeacon) {
        // sendBeacon sends POST with an empty body. Server route now
        // handles POST + GET so this lands.
        navigator.sendBeacon(beaconUrl);
      } else {
        fetch(beaconUrl, { mode: "no-cors", keepalive: true }).catch(function(){});
      }
    } catch (e) { /* never block on heartbeat */ }

    // ─── Sandbox detection ────────────────────────────────────────────
    // The widget normally renders as: small launcher button + full-screen
    // overlay modal on click. That works when our script runs in the
    // top-level page document.
    //
    // BUT: Wix / Squarespace / Webflow / Shopify's "Embed HTML" or
    // "Custom HTML" widgets wrap injected scripts in a SANDBOXED IFRAME
    // sized to whatever the page editor's widget element was sized to
    // (typically 200x80 — the size of the placeholder rectangle). Our
    // 100vw/100vh overlay then collapses to 200x80 because vw/vh resolve
    // against the iframe's viewport, NOT the parent page. The customer
    // sees a useless tiny popup with truncated menu category names.
    //
    // We can't escape a cross-origin sandboxed iframe — that's a browser
    // security boundary. The right answer is to TELL restaurants to use
    // their CMS's site-wide custom-code injection instead (see the
    // Legacy Website install instructions in the admin panel). But for
    // restaurants who paste into the wrong place anyway, fall back to
    // INLINE mode: just render the iframe directly inside the sandboxed
    // iframe, no launcher button, no overlay. The restaurant has to
    // resize their HTML widget to a reasonable height (e.g. 700px) for
    // the inline menu to be usable, but at least it WORKS instead of
    // breaking entirely.
    var inSandbox = (function(){
      try {
        // window.top is cross-origin from us in any sandboxed iframe
        // setup. Reading window.top.location throws if cross-origin.
        if (window.top === window) return false;
        // Attempt to touch a top-level property. Throws → cross-origin
        // → we're in a sandboxed iframe.
        // eslint-disable-next-line no-unused-expressions
        window.top.location.href;
        return false;
      } catch (e) {
        return true;
      }
    })();
    if (inSandbox) {
      // Inline-fallback mode. Take over the iframe's body entirely with
      // the ordering page. No button, no overlay — there's nowhere for
      // them to go. Restaurant should resize the host HTML widget to at
      // least 700px tall for this to be useful (we can't enforce that
      // from inside a sandbox).
      try {
        var inlineIframe = document.createElement("iframe");
        inlineIframe.src = base + "/embed/widget/" + encodeURIComponent(publicId);
        inlineIframe.setAttribute("allow", "payment; geolocation");
        inlineIframe.setAttribute("title", btnLabel);
        inlineIframe.style.cssText = [
          "position:fixed !important",
          "top:0 !important","left:0 !important",
          "width:100% !important","height:100% !important",
          "border:0 !important","margin:0 !important","padding:0 !important",
          "display:block !important","background:#fff !important"
        ].join(";");
        function attachInline() {
          if (document.body) {
            // Clear body styling that might constrain us, then append.
            document.body.style.margin = "0";
            document.body.style.padding = "0";
            document.body.appendChild(inlineIframe);
          } else {
            setTimeout(attachInline, 0);
          }
        }
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", attachInline);
        } else {
          attachInline();
        }
      } catch (err) {
        console.error("[FeeFreeOrdering] inline-fallback failed", err);
      }
      return; // skip button + overlay setup
    }

    // ─── Launcher button ───────────────────────────────────────────────
    // GloriaFood-style: big, bold, impossible to miss. Restaurants put
    // their own "Order Online" CTA on their site — ours has to clearly
    // outcompete that visually OR pair with it as the obvious primary.
    // Note the !important flags on layout-critical properties — host-page
    // CSS frameworks (Wix, Squarespace, Webflow, Shopify) reset button
    // styles aggressively, and we MUST resist those resets or the button
    // ends up looking like a Wix default link.
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = btnLabel;
    var btnBase = [
      // Size: substantially bigger than the old pill. Closer to a true CTA.
      "padding:18px 36px !important",
      "font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif !important",
      "font-size:18px !important",
      "font-weight:700 !important",
      "line-height:1.2 !important",
      "color:#fff !important",
      "border:0 !important",
      "border-radius:10px !important",
      "cursor:pointer !important",
      "box-shadow:0 6px 20px rgba(0,0,0,0.2) !important",
      "background:" + btnColor + " !important",
      "transition:transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease !important",
      "letter-spacing:0.02em !important",
      "text-transform:none !important",
      "text-decoration:none !important",
      "outline:none !important",
      "min-width:200px !important",
      "max-width:none !important",
      "white-space:nowrap !important"
    ];
    var btnFloating = btnBase.concat([
      "position:fixed !important",
      "bottom:28px !important",
      "right:28px !important",
      "z-index:2147483646 !important"
    ]);
    btn.style.cssText = (targetSel ? btnBase : btnFloating).join(";");
    btn.addEventListener("mouseenter", function(){
      btn.style.transform = "translateY(-2px)";
      btn.style.boxShadow = "0 10px 28px rgba(0,0,0,0.28)";
    });
    btn.addEventListener("mouseleave", function(){
      btn.style.transform = "";
      btn.style.boxShadow = "0 6px 20px rgba(0,0,0,0.2)";
    });

    // ─── Modal overlay ─────────────────────────────────────────────────
    // Sized using viewport units (vw/vh) NOT percentages — % is relative
    // to the parent element which host pages can constrain in weird ways
    // (we just lost an hour to Wix collapsing our 1200x900 modal to 200x80
    // because something upstream was sizing the flex container down).
    // vw/vh is always relative to the actual viewport, never the parent.
    // All layout-critical properties get !important for the same reason
    // the button needs them — host-page CSS resets are aggressive.
    var overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed !important",
      "top:0 !important","left:0 !important","right:0 !important","bottom:0 !important",
      "width:100vw !important","height:100vh !important",
      "z-index:2147483647 !important",
      "background:rgba(0,0,0,0.7) !important",
      "display:none",
      "align-items:center !important",
      "justify-content:center !important",
      "padding:0 !important",
      "margin:0 !important",
      "box-sizing:border-box !important"
    ].join(";");
    var frameWrap = document.createElement("div");
    // Fill the screen with a tiny breathing margin. min() guards desktop
    // from being absurdly stretched on 4K displays, but the floor is
    // 95vw/95vh so on phones / small laptops it's full-bleed.
    frameWrap.style.cssText = [
      "position:relative !important",
      "width:min(1400px, 95vw) !important",
      "height:min(1000px, 95vh) !important",
      // Hard floors so host-page sizing CANNOT shrink us below this.
      // The Wix bug was the flex item collapsing to ~200x80; min-width/
      // min-height on the actual element shuts that down cold.
      "min-width:320px !important",
      "min-height:480px !important",
      "max-width:none !important",
      "max-height:none !important",
      "background:#fff !important",
      "border-radius:12px !important",
      "overflow:hidden !important",
      "box-shadow:0 24px 64px rgba(0,0,0,0.5) !important",
      "padding:0 !important",
      "margin:0 !important",
      "box-sizing:border-box !important",
      "flex-shrink:0 !important"
    ].join(";");
    var iframe = document.createElement("iframe");
    iframe.style.cssText = [
      "width:100% !important",
      "height:100% !important",
      "border:0 !important",
      "display:block !important",
      "margin:0 !important",
      "padding:0 !important"
    ].join(";");
    iframe.setAttribute("allow", "payment; geolocation");
    iframe.setAttribute("title", btnLabel);
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\\u00D7";
    closeBtn.style.cssText = [
      "position:absolute !important",
      "top:12px !important","right:14px !important",
      "z-index:1 !important",
      "width:44px !important","height:44px !important",
      "border:0 !important","border-radius:9999px !important",
      "background:rgba(0,0,0,0.65) !important",
      "color:#fff !important","font-size:28px !important","line-height:1 !important",
      "cursor:pointer !important",
      "display:flex !important","align-items:center !important","justify-content:center !important",
      "padding:0 !important","margin:0 !important",
      "font-family:system-ui,-apple-system,sans-serif !important"
    ].join(";");
    frameWrap.appendChild(iframe);
    frameWrap.appendChild(closeBtn);
    overlay.appendChild(frameWrap);

    function open() {
      iframe.src = base + "/embed/widget/" + encodeURIComponent(publicId);
      overlay.style.setProperty("display", "flex", "important");
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    }
    function close() {
      overlay.style.setProperty("display", "none", "important");
      iframe.src = "about:blank";
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    }
    function onEsc(e) {
      if (e.key === "Escape" && overlay.style.display === "flex") close();
    }
    btn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function(e){ if (e.target === overlay) close(); });
    document.addEventListener("keydown", onEsc);

    // Mount strategy:
    //   - If data-target="#some-id" is set, replace that placeholder with
    //     the button (inline mount — lets the restaurant control where
    //     the button appears in their page flow, e.g. inside the nav).
    //   - Otherwise, append the button as a floating fixed-position
    //     bottom-right pill.
    // Overlay (the modal layer) is always appended to <body> so it can
    // float above everything regardless of where the button lives.
    function mount() {
      var mounted = false;
      if (targetSel) {
        try {
          var el = document.querySelector(targetSel);
          if (el) { el.appendChild(btn); mounted = true; }
        } catch (e) { /* invalid selector — fall through to floating */ }
      }
      if (!mounted) document.body.appendChild(btn);
      document.body.appendChild(overlay);
    }
    // Fast path: if <body> already exists (true on virtually any host
    // page since this script is typically loaded near </body>), mount
    // synchronously. Otherwise wait for DOMContentLoaded. This is the
    // delta vs the old loader, which always waited — that meant on
    // pages where our script loaded AFTER DOM ready (Wix, Squarespace,
    // etc.) the button still didn't appear until the next animation
    // frame, which feels like a delay on a slow page.
    if (document.body) {
      mount();
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      // readyState is "interactive" or "complete" but body somehow
      // still null — defer one tick.
      setTimeout(mount, 0);
    }
  } catch (err) {
    console.error("[FeeFreeOrdering] widget loader failed", err);
  }
})();`;

export async function GET() {
  // Cache short. The loader script is a public embed pasted onto third-party
  // sites (Wix, Squarespace, etc.) — when we ship a fix, we need it live in
  // minutes, not hours. The previous s-maxage=3600 left Wix sandboxes
  // serving an old script for up to an hour after deploy, even on
  // hard-refresh (CDN doesn't honor browser bypass). Keep TTLs tight; the
  // file is ~6KB so refetch cost is negligible vs. update latency.
  return new NextResponse(SCRIPT, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120, must-revalidate",
      "access-control-allow-origin": "*",
    },
  });
}
