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
    var btnLabel = (s && s.getAttribute("data-label")) || "Order Online";
    var btnColor = (s && s.getAttribute("data-color")) || "#ef4444";
    // data-target="#some-id" lets the restaurant pin the button inline
    // wherever they want on their page (e.g. inside their nav). Without
    // it, we fall back to the floating bottom-right launcher.
    var targetSel = s && s.getAttribute("data-target");

    // Launcher button (style works inline OR floating)
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = btnLabel;
    var btnBase = [
      "padding:14px 24px","font-family:system-ui,-apple-system,sans-serif",
      "font-size:16px","font-weight:700","color:#fff","border:0","border-radius:9999px",
      "cursor:pointer","box-shadow:0 8px 24px rgba(0,0,0,0.25)",
      "background:"+btnColor, "transition:transform 0.15s ease, box-shadow 0.15s ease",
      "letter-spacing:0.01em"
    ];
    var btnFloating = btnBase.concat([
      "position:fixed","bottom:24px","right:24px","z-index:2147483646"
    ]);
    btn.style.cssText = (targetSel ? btnBase : btnFloating).join(";");
    btn.addEventListener("mouseenter", function(){
      btn.style.transform = "translateY(-1px)";
      btn.style.boxShadow = "0 12px 28px rgba(0,0,0,0.3)";
    });
    btn.addEventListener("mouseleave", function(){
      btn.style.transform = "";
      btn.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
    });

    // Modal overlay — sized to feel like a real ordering page, not a
    // cramped popup. ~1200x900 desktop max, full-bleed below 900px so
    // the menu has actual breathing room on common laptop screens.
    var overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed","inset:0","z-index:2147483647",
      "background:rgba(0,0,0,0.65)","display:none","align-items:center","justify-content:center",
      "padding:16px","box-sizing:border-box"
    ].join(";");
    var frameWrap = document.createElement("div");
    // 1200x900 max, but always at least 95% of the viewport on small
    // screens. Width 100% / height 100% on phones (no padding visible).
    frameWrap.style.cssText = [
      "position:relative","width:min(1200px,100%)","height:min(900px,100%)",
      "max-width:100%","max-height:100%",
      "background:#fff","border-radius:16px","overflow:hidden",
      "box-shadow:0 20px 60px rgba(0,0,0,0.45)"
    ].join(";");
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block";
    iframe.setAttribute("allow", "payment; geolocation");
    iframe.setAttribute("loading", "lazy");
    iframe.setAttribute("title", btnLabel);
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\\u00D7";
    closeBtn.style.cssText = [
      "position:absolute","top:12px","right:14px","z-index:1",
      "width:40px","height:40px","border:0","border-radius:9999px",
      "background:rgba(0,0,0,0.6)","color:#fff","font-size:24px","line-height:1",
      "cursor:pointer","display:flex","align-items:center","justify-content:center"
    ].join(";");
    frameWrap.appendChild(iframe);
    frameWrap.appendChild(closeBtn);
    overlay.appendChild(frameWrap);

    function open() {
      iframe.src = base + "/embed/widget/" + encodeURIComponent(publicId);
      overlay.style.display = "flex";
      document.documentElement.style.overflow = "hidden";
    }
    function close() {
      overlay.style.display = "none";
      iframe.src = "about:blank";
      document.documentElement.style.overflow = "";
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
  return new NextResponse(SCRIPT, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}
