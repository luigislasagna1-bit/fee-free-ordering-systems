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
 *
 * ──────────────────────────────────────────────────────────────────────
 * TOP-LAYER RENDERING (the "Wix problem" fix)
 * ──────────────────────────────────────────────────────────────────────
 * Background: when a restaurant pastes our script into Wix's "Custom
 * Code" (the correct install path — NOT the sandboxed Embed HTML), the
 * script runs in the top-level document. BUT Wix's DOM uses wrapper
 * divs (#SITE_CONTAINER, #site-root, .masterPage, etc.) and many of
 * those wrappers have CSS `transform`, `will-change`, or `filter`
 * declared somewhere up the tree. Any ancestor with a transform
 * creates a new CONTAINING BLOCK for descendant `position: fixed`
 * elements, which means our "fixed bottom-right" launcher button is
 * actually positioned relative to that transformed ancestor — and
 * since Wix layouts often clip overflow, the button gets hidden or
 * appears in the wrong place.
 *
 * Fix: wrap the launcher button + modal overlay in a `<div popover>`
 * element and call `.showPopover()`. The HTML Popover API renders the
 * element in the browser's TOP LAYER, which sits above ALL stacking
 * contexts and is unaffected by ancestor transforms. The launcher
 * button's `position: fixed` resolves against the viewport (where it
 * should), and z-index becomes irrelevant because top-layer is
 * categorically above everything else.
 *
 * Popover API support: Chrome 114+ (2023), Safari 17+ (2023),
 * Firefox 125+ (2024). Anything older gracefully degrades to the
 * legacy `position: fixed; z-index: 2147483647` path which works for
 * most sites but can still hit the Wix issue. ~98% browser coverage
 * as of 2026.
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
    // it, we fall back to the floating launcher.
    var targetSel = s && s.getAttribute("data-target");
    // data-position controls the floating launcher's corner. One of:
    //   "br" (default — bottom-right)
    //   "bl" (bottom-left — useful when a chat widget already occupies
    //        the bottom-right corner; Tidio, Intercom, Wix Chat all
    //        default to bottom-right)
    //   "tr" (top-right)
    //   "tl" (top-left)
    // Ignored when data-target is set (inline mode picks its own spot).
    var posRaw = (s && s.getAttribute("data-position")) || "br";
    var position = (posRaw === "bl" || posRaw === "tr" || posRaw === "tl") ? posRaw : "br";

    // Install-detection heartbeat. Fire exactly ONCE per page session.
    // Uses sendBeacon (which sends an HTTP POST) — the heartbeat endpoint
    // accepts BOTH POST and GET so it survives the sendBeacon transport
    // without 405s. Fire-and-forget; we never block on it.
    try {
      var beaconUrl = base + "/api/widget/heartbeat?id=" + encodeURIComponent(publicId);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(beaconUrl);
      } else {
        fetch(beaconUrl, { mode: "no-cors", keepalive: true }).catch(function(){});
      }
    } catch (e) { /* never block on heartbeat */ }

    // ─── Sandbox detection ────────────────────────────────────────────
    // Wix / Squarespace / Webflow / Shopify's "Embed HTML" widgets wrap
    // injected scripts in a SANDBOXED IFRAME. Our 100vw/100vh overlay
    // collapses to the iframe's tiny viewport. We can't escape — that's
    // a browser security boundary. The right answer is to use the host
    // CMS's site-wide custom-code injection (documented in admin
    // panel). For restaurants who paste into the wrong place, fall
    // back to INLINE mode: render the iframe directly inside the
    // sandbox, no launcher, no overlay.
    var inSandbox = (function(){
      try {
        if (window.top === window) return false;
        // Touching a top-level property throws if cross-origin → sandboxed.
        // eslint-disable-next-line no-unused-expressions
        window.top.location.href;
        return false;
      } catch (e) {
        return true;
      }
    })();
    if (inSandbox) {
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

    // ─── Position resolver ─────────────────────────────────────────────
    // Build the corner-anchoring CSS for the floating launcher. 28px
    // margin from the page edges — feels intentional, doesn't crowd.
    function positionStyles(p) {
      switch (p) {
        case "bl": return ["bottom:28px !important","left:28px !important","top:auto !important","right:auto !important"];
        case "tr": return ["top:28px !important","right:28px !important","bottom:auto !important","left:auto !important"];
        case "tl": return ["top:28px !important","left:28px !important","bottom:auto !important","right:auto !important"];
        case "br":
        default:   return ["bottom:28px !important","right:28px !important","top:auto !important","left:auto !important"];
      }
    }

    // ─── Launcher button ───────────────────────────────────────────────
    // GloriaFood-style: big, bold, impossible to miss. Restaurants put
    // their own "Order Online" CTA on their site — ours has to clearly
    // outcompete that visually OR pair with it as the obvious primary.
    // Note the !important flags on layout-critical properties — host-page
    // CSS frameworks reset button styles aggressively, and we MUST resist
    // those resets or the button ends up looking like a default link.
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = btnLabel;
    var btnBase = [
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
      "z-index:2147483646 !important"
    ]).concat(positionStyles(position));
    // Defer the cssText assignment to mount() — we don't know yet
    // whether the inline target selector will resolve to a real element.
    // If it doesn't (common on Wix, where adding a custom-ID element is
    // not exposed in the editor), we fall back to floating styles so
    // the button is still visible somewhere instead of rendering as an
    // unpositioned invisible orphan at the bottom of the page.
    // Helper used by both inline-mount and floating-mount branches.
    function applyButtonStyles(useFloating) {
      btn.style.cssText = (useFloating ? btnFloating : btnBase).join(";");
    }
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
    // to the parent element which host pages can constrain in weird ways.
    // vw/vh is always relative to the actual viewport, never the parent.
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
    frameWrap.style.cssText = [
      "position:relative !important",
      "width:min(1400px, 95vw) !important",
      "height:min(1000px, 95vh) !important",
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

    // ─── Mount strategy ────────────────────────────────────────────────
    //
    // Three branches:
    //   1) data-target set → inline-mount the button into that element,
    //      append overlay to body. Button styling has no fixed positioning.
    //   2) Popover API available → wrap button + overlay in <div popover>
    //      and call showPopover(). Top-layer rendering bypasses ALL
    //      ancestor stacking contexts and transforms. This is the path
    //      most users hit on modern browsers (Wix included) and the
    //      reason this rewrite happened.
    //   3) Popover API absent (old browsers) → legacy path: append button
    //      + overlay to body. Relies on z-index. May still hit the Wix
    //      "transformed ancestor" issue on very old browsers, but ~2%
    //      of traffic.
    function mount() {
      // Branch 1: inline-mounted
      if (targetSel) {
        try {
          var el = document.querySelector(targetSel);
          if (el) {
            applyButtonStyles(false); // inline styles (no fixed position)
            el.appendChild(btn);
            document.body.appendChild(overlay);
            return;
          }
          // Selector valid but element doesn't exist on this page. This
          // is the Wix gotcha — the owner picked "Inline" but never
          // created the placeholder div (Wix doesn't expose custom IDs
          // in the editor). Falling through to floating means the button
          // is still visible somewhere instead of vanishing entirely.
          console.warn(
            "[FeeFreeOrdering] inline target '" + targetSel +
            "' not found on this page. Falling back to floating bottom-right. " +
            "Add an empty element with that ID, or switch to Floating in your admin."
          );
        } catch (e) { /* invalid selector — fall through to floating */ }
      }
      // Branch 2 + 3: floating. Try popover first.
      applyButtonStyles(true);
      var popoverWorks = (function(){
        try {
          var probe = document.createElement("div");
          return "popover" in probe && typeof probe.showPopover === "function";
        } catch (e) { return false; }
      })();
      if (popoverWorks) {
        var popHost = document.createElement("div");
        popHost.setAttribute("popover", "manual");
        // Override the popover UA defaults — by default popovers are
        // centered with margin:auto and have border/background. We want
        // an invisible passthrough container so our button + overlay
        // render as themselves.
        popHost.style.cssText = [
          "border:0 !important",
          "background:transparent !important",
          "padding:0 !important",
          "margin:0 !important",
          "inset:auto !important",
          "width:auto !important","height:auto !important",
          "max-width:none !important","max-height:none !important",
          "overflow:visible !important",
          // The popover itself should not capture clicks anywhere
          // except on its children. pointer-events:none on host,
          // pointer-events:auto on direct children.
          "pointer-events:none !important"
        ].join(";");
        btn.style.cssText += ";pointer-events:auto !important";
        overlay.style.cssText += ";pointer-events:auto !important";
        popHost.appendChild(btn);
        popHost.appendChild(overlay);
        document.body.appendChild(popHost);
        try {
          popHost.showPopover();
        } catch (e) {
          // showPopover can throw if the element isn't connected (we
          // just appended it, but defensive). Fall back to legacy mount.
          console.warn("[FeeFreeOrdering] popover.showPopover() threw, falling back", e);
          document.body.appendChild(btn);
          document.body.appendChild(overlay);
        }
        return;
      }
      // Branch 3: legacy path
      document.body.appendChild(btn);
      document.body.appendChild(overlay);
    }

    // Fast path: if <body> already exists (true on virtually any host
    // page since this script is typically loaded near </body>), mount
    // synchronously. Otherwise wait for DOMContentLoaded.
    if (document.body) {
      mount();
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      setTimeout(mount, 0);
    }
  } catch (err) {
    console.error("[FeeFreeOrdering] widget loader failed", err);
  }
})();`;

export async function GET() {
  // Cache short. The loader script is a public embed pasted onto third-party
  // sites — when we ship a fix, we need it live in minutes, not hours.
  return new NextResponse(SCRIPT, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=120, must-revalidate",
      "access-control-allow-origin": "*",
    },
  });
}
