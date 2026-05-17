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

    // Floating launcher button
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = btnLabel;
    btn.style.cssText = [
      "position:fixed","bottom:24px","right:24px","z-index:2147483646",
      "padding:14px 22px","font-family:system-ui,-apple-system,sans-serif",
      "font-size:15px","font-weight:600","color:#fff","border:0","border-radius:9999px",
      "cursor:pointer","box-shadow:0 8px 24px rgba(0,0,0,0.25)",
      "background:"+btnColor
    ].join(";");

    // Modal overlay
    var overlay = document.createElement("div");
    overlay.style.cssText = [
      "position:fixed","inset:0","z-index:2147483647",
      "background:rgba(0,0,0,0.55)","display:none","align-items:center","justify-content:center"
    ].join(";");
    var frameWrap = document.createElement("div");
    frameWrap.style.cssText = [
      "position:relative","width:min(960px,96vw)","height:min(720px,92vh)",
      "background:#fff","border-radius:12px","overflow:hidden",
      "box-shadow:0 20px 60px rgba(0,0,0,0.4)"
    ].join(";");
    var iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block";
    iframe.setAttribute("allow", "payment; geolocation");
    iframe.setAttribute("loading", "lazy");
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\\u00D7";
    closeBtn.style.cssText = [
      "position:absolute","top:8px","right:10px","z-index:1",
      "width:36px","height:36px","border:0","border-radius:9999px",
      "background:rgba(0,0,0,0.5)","color:#fff","font-size:24px","line-height:1",
      "cursor:pointer"
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
    btn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function(e){ if (e.target === overlay) close(); });

    function mount() {
      document.body.appendChild(btn);
      document.body.appendChild(overlay);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mount);
    } else {
      mount();
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
