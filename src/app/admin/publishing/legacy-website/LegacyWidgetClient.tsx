"use client";
import { useMemo, useState } from "react";
import {
  Copy, Check, AlertCircle, Info, Sparkles, Printer,
  ChevronDown, ChevronRight, Code2, MousePointerClick, ExternalLink,
} from "lucide-react";

/**
 * Widget customizer + per-platform install guide.
 *
 * Visual model:
 *   - Top hero: explains what this is + "not published yet" warning
 *   - Left column: form controls (label, color, position)
 *   - Right column: live preview of how the launcher button will appear
 *     on the restaurant's site (mock browser frame, real CSS values)
 *   - Below: generated snippet (only the attributes that differ from
 *     defaults are emitted — keeps the paste short)
 *   - Bottom: collapsible platform guide. Restaurant picks their CMS
 *     and sees exact step-by-step instructions for that platform.
 *
 * No server state — this is all client-side preview + clipboard copy.
 * Settings reset on page reload (kept simple intentionally; if owners
 * want to persist, we'll add server-side storage later).
 */

type Position = "br" | "bl" | "tr" | "tl" | "inline";
/**
 * Snippet types — two primary patterns + one advanced:
 *
 *   - "popup_js":   JS widget that injects a floating button + opens a
 *                   full-screen modal on click. Most polished UX. Requires
 *                   pasting into the host site's site-wide Custom Code area.
 *
 *   - "button_link": plain HTML <a> styled as a button. Opens the full
 *                   /order/<slug> page in a new tab on click. Works in
 *                   ANY HTML widget on ANY site builder because it's just
 *                   HTML — no JavaScript, no Custom Code area required.
 *                   The GloriaFood-equivalent install pattern.
 *
 *   - "iframe":     advanced. Plain <iframe> snippet that embeds the entire
 *                   ordering UI inline. Hidden behind an "advanced" disclosure
 *                   in the UI because most restaurants find the button pattern
 *                   simpler to reason about and they're surprised when an
 *                   iframe doesn't show a button. (UAT feedback round 3.)
 */
type SnippetType = "popup_js" | "button_link" | "iframe";

const DEFAULT_LABEL = "See MENU & Order";
const DEFAULT_COLOR = "#ef4444";
const DEFAULT_IFRAME_HEIGHT = 700;

export function LegacyWidgetClient({
  publicId,
  orderSlug,
  baseUrl,
  isPublished,
  acceptsReservations = false,
}: {
  publicId: string;
  /** Public restaurant slug used in /order/<slug> URLs — passed alongside
   *  publicId because the button_link snippet links to the real order
   *  page (slug-based, shareable) while popup_js + iframe use the
   *  widget-token URLs. */
  orderSlug: string;
  baseUrl: string;
  isPublished: boolean;
  /** When true, emit a SECOND "Book a Table" widget snippet below the
   *  main ordering snippet. Mirrors GloriaFood's pattern where the same
   *  embed page surfaces both buttons. Skipped entirely when the
   *  restaurant has reservations disabled — no point in a button that
   *  opens an empty modal. */
  acceptsReservations?: boolean;
}) {
  const [snippetType, setSnippetType] = useState<SnippetType>("popup_js");
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [position, setPosition] = useState<Position>("br");
  const [customSelector, setCustomSelector] = useState("#order-button");
  const [iframeHeight, setIframeHeight] = useState(DEFAULT_IFRAME_HEIGHT);
  const [platform, setPlatform] = useState<string>("wix");
  const [copied, setCopied] = useState(false);

  /** Build the snippet on the fly. Only emit attributes that differ from
   *  defaults so the paste stays minimal — fewer things for restaurants
   *  to fat-finger. */
  const snippet = useMemo(() => {
    if (snippetType === "iframe") {
      // GloriaFood-style plain HTML embed. Renders the full ordering UI
      // inline wherever pasted — works in any builder's HTML widget.
      // Height is configurable because the right value depends on how
      // much menu content there is and how the page flows around it.
      return [
        `<!-- Fee Free Ordering — HTML embed (paste anywhere) -->`,
        `<iframe`,
        `  src="${baseUrl}/embed/widget/${publicId}"`,
        `  style="width:100%;height:${iframeHeight}px;border:0;display:block;"`,
        `  allow="payment; geolocation"`,
        `  title="${escapeHtml(label || DEFAULT_LABEL)}"`,
        `></iframe>`,
      ].join("\n");
    }
    if (snippetType === "button_link") {
      // Plain HTML button styled with inline CSS so it renders identically
      // anywhere (no external stylesheet needed). Opens /order/<slug>
      // (NOT the embed iframe URL — we want the customer to land on
      // a real shareable page, not an iframe-mode UI). target="_blank"
      // + rel for security/perf. Inline styles match the JS popup button's
      // visual treatment so the brand stays consistent across patterns.
      const safeColor = color || DEFAULT_COLOR;
      const safeLabel = escapeHtml(label || DEFAULT_LABEL);
      // We embed the slug-based public order URL. publicId is the wgt_
      // token used by the JS widget; for the public-facing order page
      // we use the restaurant's slug, passed in as a prop.
      const orderUrl = `${baseUrl}/order/${orderSlug}`;
      return [
        `<!-- Fee Free Ordering — button link (opens menu in new tab) -->`,
        `<a href="${orderUrl}"`,
        `   target="_blank"`,
        `   rel="noopener noreferrer"`,
        `   style="display:inline-block;background:${safeColor};color:#fff;padding:18px 36px;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.2);letter-spacing:0.02em;white-space:nowrap;">${safeLabel}</a>`,
      ].join("\n");
    }
    // JS popup widget
    const lines = [
      `<!-- Fee Free Ordering widget -->`,
      `<script src="${baseUrl}/embed/widget.js"`,
      `        data-restaurant="${publicId}"`,
    ];
    if (label !== DEFAULT_LABEL) lines.push(`        data-label="${escapeHtml(label)}"`);
    if (color.toLowerCase() !== DEFAULT_COLOR) lines.push(`        data-color="${color}"`);
    if (position === "inline" && customSelector.trim()) {
      lines.push(`        data-target="${escapeHtml(customSelector.trim())}"`);
    } else if (position !== "br" && position !== "inline") {
      // Only emit data-position when it differs from the default ("br").
      // Keeps the paste short for the common case.
      lines.push(`        data-position="${position}"`);
    }
    lines.push(`        async defer></script>`);
    return lines.join("\n");
  }, [snippetType, baseUrl, publicId, label, color, position, customSelector, iframeHeight, orderSlug]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* older browser — no-op */
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Not-published banner ─────────────────────────────────────── */}
      {!isPublished && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <p className="font-medium">Not yet published</p>
            <p className="mt-0.5 text-emerald-800">
              You can copy this code now, but the widget won&apos;t accept orders until you finish setup
              and click Publish on the previous page.
            </p>
          </div>
        </div>
      )}

      {/* ── Snippet type picker ──────────────────────────────────────── */}
      {/* Two fundamentally different install patterns:
            1) Popup button (recommended for most) — slick UX, but
               must paste into site-wide Custom Code area.
            2) HTML Embed — plain iframe, works in any HTML widget
               anywhere on your page. Same as GloriaFood. Less slick
               (no full-screen modal) but lets you put the menu in
               any specific location you want. */}
      <div className="grid sm:grid-cols-2 gap-3">
        <SnippetTypeCard
          active={snippetType === "popup_js"}
          onClick={() => setSnippetType("popup_js")}
          icon={<MousePointerClick className="w-5 h-5" />}
          title="Popup button"
          description="Floating button on every page that opens a full-screen ordering modal. Most polished UX. Must be pasted into your site's site-wide custom code area."
          tag="BEST UX"
          tagColor="emerald"
        />
        <SnippetTypeCard
          active={snippetType === "button_link"}
          onClick={() => setSnippetType("button_link")}
          icon={<ExternalLink className="w-5 h-5" />}
          title="HTML Button (paste anywhere)"
          description="A styled HTML button you paste into any HTML widget on your page. Click opens the full ordering page in a new tab. Works in any builder. Same approach GloriaFood uses."
          tag="WORKS EVERYWHERE"
          tagColor="amber"
        />
      </div>

      {/* Advanced: inline iframe embed. Tucked behind a disclosure
          because most restaurants find it confusing — they expect a
          button and get an inline menu instead. Still useful when the
          owner wants a dedicated "Order Online" page that shows the
          menu directly with no intermediate click, so we don't drop
          it entirely. */}
      <details className="rounded-lg border border-gray-200 bg-white">
        <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-gray-600 hover:text-gray-900 flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5" />
          Advanced: embed the entire menu inline (instead of a button)
          {snippetType === "iframe" && (
            <span className="ml-auto text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
              ACTIVE
            </span>
          )}
        </summary>
        <div className="border-t border-gray-200 p-4">
          <button
            type="button"
            onClick={() => setSnippetType(snippetType === "iframe" ? "button_link" : "iframe")}
            className={
              snippetType === "iframe"
                ? "w-full text-left rounded-xl border-2 border-blue-400 bg-blue-50/40 p-4 transition"
                : "w-full text-left rounded-xl border-2 border-gray-200 hover:border-gray-300 bg-white p-4 transition"
            }
          >
            <div className="flex items-start gap-3">
              <div className={snippetType === "iframe" ? "w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center flex-shrink-0" : "w-10 h-10 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0"}>
                <Code2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-gray-900 text-sm">HTML Embed (inline menu, no button)</h4>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Plain iframe that renders the entire menu directly inline. No button, no popup — customers browse and order without clicking anything first. Best for a dedicated &quot;Order Online&quot; page.
                </p>
              </div>
            </div>
          </button>
        </div>
      </details>

      {/* ── Customizer (controls + live preview) ─────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Controls */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <h3 className="font-semibold text-gray-900">Customize</h3>
          </div>

          {snippetType === "iframe" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Embed height (pixels)
                </label>
                <input
                  type="number"
                  min={300}
                  max={2000}
                  step={50}
                  value={iframeHeight}
                  onChange={(e) => setIframeHeight(Math.max(300, Math.min(2000, parseInt(e.target.value) || DEFAULT_IFRAME_HEIGHT)))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
                />
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Height of the embedded menu in your page. <strong>700px</strong> is a good default — fits most menus without scrolling inside the iframe. Increase if you have many categories.
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 leading-relaxed">
                <p className="font-bold mb-1">📝 Where to paste this</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>In Wix: drag in an <strong>&quot;Embed HTML&quot;</strong> element wherever you want the menu</li>
                  <li>Paste the code below into it</li>
                  <li>Resize the Wix element to roughly match the height above</li>
                </ol>
                <p className="mt-2">Works the same on Squarespace (Code Block), WordPress (Custom HTML block), Webflow (Embed widget), etc.</p>
              </div>
            </>
          )}

          {snippetType === "button_link" && (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                <p className="font-bold mb-1">📝 Where to paste this</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>In Wix: drag in an <strong>&quot;Embed HTML&quot;</strong> element wherever you want the button to appear (a section header, your &quot;Order Online&quot; page, anywhere)</li>
                  <li>Paste the code below into it</li>
                  <li>Wix shows a small white box — that&apos;s the button, click <strong>Preview</strong> or <strong>Publish</strong> to see it styled</li>
                </ol>
                <p className="mt-2">Click opens the full ordering experience in a new tab. Customer can browse, add to cart, and checkout there.</p>
              </div>
            </>
          )}

          {/* Label + color — shared by popup_js AND button_link */}
          {snippetType !== "iframe" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Button text
                </label>
                <input
                  type="text"
                  value={label}
                  maxLength={40}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={DEFAULT_LABEL}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  What the button says. Default: &quot;See MENU &amp; Order&quot; (the
                  proven highest-clicked version).
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Button color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-12 h-10 border border-gray-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="#ef4444"
                    pattern="^#[0-9a-fA-F]{6}$"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[
                    { name: "Red",     value: "#ef4444" },
                    { name: "Orange",  value: "#f97316" },
                    { name: "Yellow",  value: "#eab308" },
                    { name: "Green",   value: "#10b981" },
                    { name: "Blue",    value: "#3b82f6" },
                    { name: "Purple",  value: "#8b5cf6" },
                    { name: "Pink",    value: "#ec4899" },
                    { name: "Black",   value: "#111827" },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setColor(c.value)}
                      title={c.name}
                      className="w-6 h-6 rounded-full border-2 border-white shadow ring-1 ring-gray-200 hover:scale-110 transition"
                      style={{ background: c.value }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {snippetType === "popup_js" && (
            <>
          {/* Position */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Button position
            </label>
            <div className="space-y-1.5">
              <PosRadio
                value="br"
                current={position}
                onSelect={setPosition}
                label="Floating, bottom-right"
                hint="Default. Always visible. ⚠️ May overlap with chat widgets (Tidio, Intercom, Wix Chat) which also default here — try bottom-left if you have a chat bubble."
              />
              <PosRadio
                value="bl"
                current={position}
                onSelect={setPosition}
                label="Floating, bottom-left"
                hint="Avoids the bottom-right corner where most chat widgets live."
              />
              <PosRadio
                value="tr"
                current={position}
                onSelect={setPosition}
                label="Floating, top-right"
                hint="High visibility on first scroll. Good when your hero section already has a CTA at the bottom."
              />
              <PosRadio
                value="tl"
                current={position}
                onSelect={setPosition}
                label="Floating, top-left"
                hint="Least common — usually conflicts with the site logo. Use only if other corners are taken."
              />
              <PosRadio
                value="inline"
                current={position}
                onSelect={setPosition}
                label="Inline (custom location)"
                hint="Place the button anywhere on your page using a CSS selector."
              />
            </div>
            {position === "inline" && (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                  <p className="font-bold mb-1">⚠️ Inline mode requires a placeholder element</p>
                  <p>
                    For inline mode to work, your website needs an empty HTML element with a matching ID
                    (e.g. <code className="bg-white/70 px-1 rounded">&lt;div id=&quot;order-button&quot;&gt;&lt;/div&gt;</code>)
                    placed exactly where you want the button to appear.
                  </p>
                  <p className="mt-2">
                    <strong>If you&apos;re on Wix, Squarespace, or another no-code builder, this is usually
                    hard or impossible.</strong> Those editors don&apos;t expose custom IDs. <strong>Use one of the
                    Floating positions instead</strong> — they always work and you can pick any corner. If
                    your inline target isn&apos;t found, the widget auto-falls-back to floating bottom-right
                    so customers can still order.
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Target element (CSS selector)
                  </label>
                  <input
                    type="text"
                    value={customSelector}
                    onChange={(e) => setCustomSelector(e.target.value)}
                    placeholder="#order-button"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400 transition"
                  />
                </div>
              </div>
            )}
          </div>
            </>
          )}
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">Live preview</h3>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded">
              How it&apos;ll look
            </span>
          </div>
          <BrowserMock>
            {snippetType === "iframe" ? (
              <div className="absolute inset-2 bg-white border border-emerald-200 rounded shadow-inner flex flex-col items-center justify-center p-2 gap-1.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                  Embedded menu
                </div>
                <div className="text-[10px] text-gray-500 text-center leading-tight">
                  The whole ordering UI renders right here, inline on your page.
                </div>
                <div className="mt-1 px-2 py-1 bg-emerald-500 text-white text-[10px] rounded">
                  Pickup · 20 min
                </div>
                <div className="flex gap-1 mt-1">
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] rounded">Pizzas</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[8px] rounded">Drinks</span>
                </div>
              </div>
            ) : snippetType === "button_link" ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <button
                  type="button"
                  disabled
                  style={{
                    background: color,
                    padding: "18px 36px",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#fff",
                    border: 0,
                    borderRadius: "10px",
                    cursor: "pointer",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
                    minWidth: "200px",
                    letterSpacing: "0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label || DEFAULT_LABEL}
                </button>
              </div>
            ) : (
              <div
                className={previewContainerClass(position)}
                style={position === "inline" ? { padding: "12px" } : undefined}
              >
                <button
                  type="button"
                  disabled
                  style={{
                    background: color,
                    padding: "18px 36px",
                    fontSize: "18px",
                    fontWeight: 700,
                    color: "#fff",
                    border: 0,
                    borderRadius: "10px",
                    cursor: "pointer",
                    boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
                    minWidth: "200px",
                    letterSpacing: "0.02em",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label || DEFAULT_LABEL}
                </button>
              </div>
            )}
          </BrowserMock>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            {snippetType === "iframe"
              ? "The embed renders the menu inline — no popup, no overlay. Customers stay on your page while they order."
              : snippetType === "button_link"
              ? "Clicking the button opens the full ordering page in a new browser tab. Customer browses, orders, checks out there — your original page stays open in their other tab."
              : "Clicking the real button on your site opens a full-screen modal with your complete ordering UI — pickup/delivery toggle, menu categories, cart, checkout. Not previewed here."}
          </p>
        </div>
      </div>

      {/* ── Generated snippet ────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-semibold text-gray-300">Install code</span>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white transition"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy code"}
          </button>
        </div>
        <pre className="p-4 text-xs text-gray-100 overflow-x-auto whitespace-pre">{snippet}</pre>
      </div>

      {/* ── Book a Table widget (when reservations enabled) ───────────
          Mirrors GloriaFood: a SECOND button snippet that opens the
          reservation modal directly. Only rendered when the restaurant
          has acceptsReservations=true so we don't dangle a useless
          button. Paste both snippets together to get the GloriaFood-
          style "See Menu / Book a Table" pair. */}
      {acceptsReservations && (
        <ReservationSnippet
          publicId={publicId}
          orderSlug={orderSlug}
          baseUrl={baseUrl}
          snippetType={snippetType}
          color={color}
        />
      )}

      {/* ── Platform install guide ───────────────────────────────────── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-blue-900">Where to paste this code</h3>
        </div>

        <p className="text-sm text-blue-900 leading-relaxed">
          The code goes into your website&apos;s <strong>site-wide custom code area</strong> — where
          Google Analytics or Facebook Pixel scripts go. NOT into an inline
          &quot;Embed HTML&quot; element on a page. Most website builders sandbox
          inline embeds in tiny iframes which prevents the ordering modal
          from opening full-size.
        </p>

        <div>
          <label className="block text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">
            What platform is your website on?
          </label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className={
                  platform === p.id
                    ? "px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white border border-blue-600 transition"
                    : "px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-blue-900 border border-blue-200 hover:border-blue-400 transition"
                }
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white border border-blue-200 p-4">
          <PlatformGuide platform={platform} />
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => window.print()}
            className="text-xs text-blue-800 hover:text-blue-600 inline-flex items-center gap-1.5 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Print these instructions
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SnippetTypeCard({
  active,
  onClick,
  icon,
  title,
  description,
  tag,
  tagColor,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  tag: string;
  tagColor: "emerald" | "blue" | "amber";
}) {
  const tagClass =
    tagColor === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : tagColor === "amber"
      ? "bg-amber-100 text-amber-800"
      : "bg-blue-100 text-blue-800";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "text-left rounded-xl border-2 border-emerald-400 bg-emerald-50/40 p-4 transition"
          : "text-left rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 p-4 transition"
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            active
              ? "w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center flex-shrink-0"
              : "w-10 h-10 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0"
          }
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-gray-900 text-sm">{title}</h4>
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 ${tagClass}`}>
              {tag}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  );
}

function PosRadio({
  value,
  current,
  onSelect,
  label,
  hint,
}: {
  value: Position;
  current: Position;
  onSelect: (p: Position) => void;
  label: string;
  hint: string;
}) {
  const selected = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={
        selected
          ? "w-full text-left px-3 py-2 rounded-lg border-2 border-emerald-400 bg-emerald-50 transition"
          : "w-full text-left px-3 py-2 rounded-lg border-2 border-gray-200 bg-white hover:border-gray-300 transition"
      }
    >
      <div className="flex items-center gap-2">
        <div
          className={
            selected
              ? "w-3.5 h-3.5 rounded-full border-2 border-emerald-500 bg-emerald-500"
              : "w-3.5 h-3.5 rounded-full border-2 border-gray-300 bg-white"
          }
        />
        <span className="text-sm font-medium text-gray-900">{label}</span>
      </div>
      <p className="text-[11px] text-gray-500 mt-0.5 ml-5.5 pl-0.5 leading-snug">{hint}</p>
    </button>
  );
}

function BrowserMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white overflow-hidden">
      {/* Fake browser chrome */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 mx-2">
          <div className="bg-white border border-gray-200 rounded-md px-2 py-1 text-[10px] text-gray-400">
            yourrestaurant.com
          </div>
        </div>
      </div>
      {/* Mock content */}
      <div className="relative h-56 bg-gradient-to-br from-amber-50 via-emerald-50 to-emerald-50 overflow-hidden">
        <div className="absolute inset-0 p-4 text-gray-400 text-[10px] leading-relaxed">
          <div className="h-3 w-24 bg-gray-200 rounded mb-2" />
          <div className="h-2 w-40 bg-gray-100 rounded mb-1" />
          <div className="h-2 w-32 bg-gray-100 rounded mb-1" />
          <div className="h-2 w-36 bg-gray-100 rounded mb-3" />
          <div className="h-16 w-full bg-gray-100 rounded mb-2" />
          <div className="h-2 w-28 bg-gray-100 rounded" />
        </div>
        {children}
      </div>
    </div>
  );
}

function previewContainerClass(position: Position): string {
  switch (position) {
    case "br":
      return "absolute bottom-4 right-4";
    case "bl":
      return "absolute bottom-4 left-4";
    case "tr":
      return "absolute top-4 right-4";
    case "tl":
      return "absolute top-4 left-4";
    case "inline":
      return "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";
  }
}

// ─── Platform guides ─────────────────────────────────────────────────────────

const PLATFORMS = [
  { id: "wix",         label: "Wix" },
  { id: "squarespace", label: "Squarespace" },
  { id: "wordpress",   label: "WordPress" },
  { id: "shopify",     label: "Shopify" },
  { id: "webflow",     label: "Webflow" },
  { id: "godaddy",     label: "GoDaddy" },
  { id: "html",        label: "Plain HTML" },
];

function PlatformGuide({ platform }: { platform: string }) {
  switch (platform) {
    case "wix":
      return (
        <Steps title="Wix — Custom Code (the right way)">
          <Step n={1}>
            Go to <a href="https://manage.wix.com/account/sites" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">manage.wix.com</a> and click your site.
          </Step>
          <Step n={2}>In the left sidebar, click <strong>Settings</strong>.</Step>
          <Step n={3}>Click <strong>Custom Code</strong> (sometimes under <strong>Advanced</strong>).</Step>
          <Step n={4}>Click <strong>+ Add Custom Code</strong>.</Step>
          <Step n={5}>Paste the install code from above.</Step>
          <Step n={6}>
            Name: <em>Fee Free Ordering Widget</em>. Add to: <strong>All pages, load code once</strong>. Place in: <strong>Body — end</strong>.
          </Step>
          <Step n={7}>Click <strong>Apply</strong>, then publish your Wix site.</Step>
          <WarnBox>
            ⚠️ Do <strong>NOT</strong> paste this code into an &quot;Embed HTML&quot; element on a page. Wix sandboxes those in iframes and the ordering modal won&apos;t open full-size.
          </WarnBox>
          <WarnBox>
            <strong>Don&apos;t see the button on your live site?</strong> If you have Wix Chat enabled it sits in the bottom-right corner and can cover our button. Switch the <em>Button position</em> above to &quot;Floating, bottom-left&quot; (or top-right) and re-copy the code. You don&apos;t need to re-paste into Wix — just edit the existing snippet to add <code className="bg-gray-100 px-1 rounded text-[10px]">data-position=&quot;bl&quot;</code>.
          </WarnBox>
        </Steps>
      );
    case "squarespace":
      return (
        <Steps title="Squarespace — Code Injection">
          <Step n={1}>In your Squarespace dashboard, go to <strong>Settings → Developer Tools → Code Injection</strong>.</Step>
          <Step n={2}>Paste the install code into the <strong>Footer</strong> box.</Step>
          <Step n={3}>Click <strong>Save</strong>. The widget loads on every page automatically.</Step>
        </Steps>
      );
    case "wordpress":
      return (
        <Steps title="WordPress — Footer Snippet">
          <Step n={1}>
            <strong>Easiest:</strong> install the free plugin <em>Insert Headers and Footers</em> (or <em>WPCode</em>) from Plugins → Add New.
          </Step>
          <Step n={2}>Open the plugin&apos;s settings. Paste the install code into the <strong>Footer</strong> / &quot;Before &lt;/body&gt;&quot; box.</Step>
          <Step n={3}>Save changes.</Step>
          <Step n={4}>
            <strong>Alternative (developers):</strong> edit your theme&apos;s <code className="bg-gray-100 px-1 rounded">footer.php</code> and
            paste the snippet just before <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code>.
          </Step>
        </Steps>
      );
    case "shopify":
      return (
        <Steps title="Shopify — Theme Edit">
          <Step n={1}>In your Shopify admin, go to <strong>Online Store → Themes</strong>.</Step>
          <Step n={2}>Click <strong>Actions → Edit code</strong> on your live theme.</Step>
          <Step n={3}>In the file list, click <code className="bg-gray-100 px-1 rounded">theme.liquid</code>.</Step>
          <Step n={4}>
            Find the closing <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code> tag near the bottom. Paste the install code on the line just above it.
          </Step>
          <Step n={5}>Click <strong>Save</strong>.</Step>
        </Steps>
      );
    case "webflow":
      return (
        <Steps title="Webflow — Custom Code">
          <Step n={1}>In your Webflow project, click the <strong>Project Settings</strong> gear icon.</Step>
          <Step n={2}>Go to <strong>Custom Code</strong>.</Step>
          <Step n={3}>Paste the install code into the <strong>Footer Code</strong> box.</Step>
          <Step n={4}>Click <strong>Save Changes</strong>, then <strong>Publish</strong> your site.</Step>
        </Steps>
      );
    case "godaddy":
      return (
        <Steps title="GoDaddy Website Builder">
          <Step n={1}>In your GoDaddy site editor, click <strong>Add Section</strong> → search for <strong>HTML</strong>.</Step>
          <Step n={2}>
            ⚠️ GoDaddy sandboxes the HTML section in an iframe, similar to Wix. The button works but you&apos;ll need to size the section tall enough (~600px+) for customers to see the menu when they click it.
          </Step>
          <Step n={3}>Paste the install code into the HTML section.</Step>
          <Step n={4}>Resize the section to take a meaningful chunk of the page.</Step>
          <Step n={5}>Save and publish.</Step>
          <WarnBox>
            If you have access to GoDaddy&apos;s site-wide settings or a paid plan with custom code support, paste this into the site footer instead — that&apos;s the cleaner install.
          </WarnBox>
        </Steps>
      );
    case "html":
      return (
        <Steps title="Plain HTML site">
          <Step n={1}>Open the HTML file for any page where you want the widget.</Step>
          <Step n={2}>
            Find the closing <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code> tag at the bottom of the file.
          </Step>
          <Step n={3}>Paste the install code on a new line just before <code className="bg-gray-100 px-1 rounded">&lt;/body&gt;</code>.</Step>
          <Step n={4}>Save the file and upload it to your hosting.</Step>
          <Step n={5}>For multi-page sites, repeat on each page (or include via a shared footer template).</Step>
        </Steps>
      );
    default:
      return null;
  }
}

function Steps({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-bold text-gray-900 mb-3">{title}</h4>
      <ol className="space-y-2">{children}</ol>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm text-gray-800">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
      {children}
    </div>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Second widget snippet specifically for the Book-a-Table button.
 * Renders in the same install-code style as the main snippet so
 * owners can copy both into the same page. GloriaFood ships their
 * widget as TWO `<span class="glf-button">` elements + one shared
 * <script> tag; we ship two independent snippets (each self-contained)
 * because our widget script is restaurant-scoped via data-restaurant
 * — pasting twice is fine, the heartbeat dedupes itself.
 *
 * Reservation mode is signalled to the loader via data-mode="reservation".
 * The loader appends ?reservation=1 to the iframe URL which the
 * OrderingPageClient picks up to auto-open the table modal.
 */
function ReservationSnippet({
  publicId,
  orderSlug,
  baseUrl,
  snippetType,
  color,
}: {
  publicId: string;
  orderSlug: string;
  baseUrl: string;
  snippetType: "popup_js" | "button_link" | "iframe";
  color: string;
}) {
  const [copied, setCopied] = useState(false);
  const snippet = useMemo(() => {
    if (snippetType === "iframe") {
      // iframe mode → standalone reservation page (GloriaFood UX).
      // No menu chrome inside the iframe; the customer lands directly
      // on the form. Iframe height stays at 700px which fits the form
      // comfortably without scrolling.
      return [
        `<!-- Fee Free Ordering — Book a Table (iframe) -->`,
        `<iframe`,
        `  src="${baseUrl}/embed/widget/${publicId}?mode=reservation"`,
        `  style="width:100%;border:0;display:block"`,
        `  height="700"`,
        `  allow="payment; geolocation"`,
        `  title="Book a Table"></iframe>`,
      ].join("\n");
    }
    if (snippetType === "button_link") {
      // Plain HTML button that opens the STANDALONE reservation page
      // in a new tab — no menu visible. Customer lands straight on
      // the form. Same visual treatment as the main menu button.
      return [
        `<!-- Fee Free Ordering — Book a Table (HTML button) -->`,
        `<a href="${baseUrl}/order/${orderSlug}/reservation"`,
        `   target="_blank"`,
        `   rel="noopener noreferrer"`,
        `   style="display:inline-block;background:${color};color:#fff;padding:18px 36px;font-family:system-ui,-apple-system,sans-serif;font-size:18px;font-weight:700;text-decoration:none;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.2);letter-spacing:0.02em;white-space:nowrap;">Book a Table</a>`,
      ].join("\n");
    }
    // popup_js — same script, data-mode flag flips it to reservation.
    return [
      `<!-- Fee Free Ordering — Book a Table button -->`,
      `<script src="${baseUrl}/embed/widget.js"`,
      `        data-restaurant="${publicId}"`,
      `        data-mode="reservation"`,
      `        data-label="Book a Table"`,
      `        async defer></script>`,
    ].join("\n");
  }, [publicId, orderSlug, baseUrl, snippetType, color]);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-300">Book a Table — install code</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch { /* noop */ }
          }}
          className="flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white transition"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied" : "Copy code"}
        </button>
      </div>
      <pre className="p-4 text-xs text-gray-100 overflow-x-auto whitespace-pre">{snippet}</pre>
    </div>
  );
}
