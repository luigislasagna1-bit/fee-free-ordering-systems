"use client";
import { useMemo, useState } from "react";
import {
  Copy, Check, AlertCircle, Info, Sparkles, Printer,
  ChevronDown, ChevronRight, Code2, MousePointerClick, ExternalLink,
} from "lucide-react";
import { useTranslations } from "next-intl";

/** Inline Facebook brand mark. Lucide doesn't ship a Facebook icon
 *  (third-party brand marks aren't in their open set), so we use the
 *  official brand glyph directly. Kept colourable via `currentColor`. */
const FacebookGlyph = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M22 12C22 6.477 17.523 2 12 2S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12Z"/>
  </svg>
);

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
  baseUrl,
  orderUrl,
  reservationUrl,
  isPublished,
  acceptsReservations = false,
}: {
  publicId: string;
  /** Platform apex base (NEXT_PUBLIC_APP_URL). Used ONLY for the /embed/*
   *  token URLs (widget.js script + iframe), which must stay on the apex. */
  baseUrl: string;
  /** Customer-facing storefront URL on the restaurant's MOST-BRANDED domain
   *  (verified custom domain > subdomain > apex). Precomputed server-side via
   *  restaurantOrderUrl so the owner's pasted button/Facebook link lands on
   *  their own domain, not feefreeordering.com. */
  orderUrl: string;
  /** Customer-facing reservation URL on the most-branded domain. */
  reservationUrl: string;
  isPublished: boolean;
  /** When true, emit a SECOND "Book a Table" widget snippet below the
   *  main ordering snippet. Mirrors GloriaFood's pattern where the same
   *  embed page surfaces both buttons. Skipped entirely when the
   *  restaurant has reservations disabled — no point in a button that
   *  opens an empty modal. */
  acceptsReservations?: boolean;
}) {
  const t = useTranslations("admin.legacyWidget");
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
      // We embed the public-facing order URL on the restaurant's most-branded
      // domain (verified custom domain > subdomain > apex), precomputed
      // server-side. publicId is the wgt_ token used by the JS widget; the
      // shareable order page uses the branded order URL passed in as a prop.
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
  }, [snippetType, baseUrl, publicId, label, color, position, customSelector, iframeHeight, orderUrl]);

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
            <p className="font-medium">{t("notYetPublishedTitle")}</p>
            <p className="mt-0.5 text-emerald-800">
              {t("notYetPublishedBody")}
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
          title={t("popupButtonTitle")}
          description={t("popupButtonDescription")}
          tag={t("popupButtonTag")}
          tagColor="emerald"
        />
        <SnippetTypeCard
          active={snippetType === "button_link"}
          onClick={() => setSnippetType("button_link")}
          icon={<ExternalLink className="w-5 h-5" />}
          title={t("htmlButtonTitle")}
          description={t("htmlButtonDescription")}
          tag={t("htmlButtonTag")}
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
          {t("advancedEmbedSummary")}
          {snippetType === "iframe" && (
            <span className="ml-auto text-[10px] font-bold text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
              {t("activeBadge")}
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
                <h4 className="font-bold text-gray-900 text-sm">{t("htmlEmbedCardTitle")}</h4>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  {t("htmlEmbedCardDescription")}
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
            <h3 className="font-semibold text-gray-900">{t("customizeHeading")}</h3>
          </div>

          {snippetType === "iframe" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {t("embedHeightLabel")}
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
                  {t.rich("embedHeightHint", { strong: (c) => <strong>{c}</strong> })}
                </p>
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 leading-relaxed">
                <p className="font-bold mb-1">{t("iframeWhereToPasteTitle")}</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>{t.rich("iframeWhereToPasteStep1", { strong: (c) => <strong>{c}</strong> })}</li>
                  <li>{t("iframeWhereToPasteStep2")}</li>
                  <li>{t("iframeWhereToPasteStep3")}</li>
                </ol>
                <p className="mt-2">{t("iframeWhereToPasteNote")}</p>
              </div>
            </>
          )}

          {snippetType === "button_link" && (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                <p className="font-bold mb-1">{t("buttonLinkWhereToPasteTitle")}</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>{t.rich("buttonLinkWhereToPasteStep1", { strong: (c) => <strong>{c}</strong> })}</li>
                  <li>{t("buttonLinkWhereToPasteStep2")}</li>
                  <li>{t.rich("buttonLinkWhereToPasteStep3", { strong: (c) => <strong>{c}</strong> })}</li>
                </ol>
                <p className="mt-2">{t("buttonLinkWhereToPasteNote")}</p>
              </div>
            </>
          )}

          {/* Label + color — shared by popup_js AND button_link */}
          {snippetType !== "iframe" && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {t("buttonTextLabel")}
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
                  {t("buttonTextHint")}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  {t("buttonColorLabel")}
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
                    { name: t("colorRed"),    value: "#ef4444" },
                    { name: t("colorOrange"), value: "#f97316" },
                    { name: t("colorYellow"), value: "#eab308" },
                    { name: t("colorGreen"),  value: "#10b981" },
                    { name: t("colorBlue"),   value: "#3b82f6" },
                    { name: t("colorPurple"), value: "#8b5cf6" },
                    { name: t("colorPink"),   value: "#ec4899" },
                    { name: t("colorBlack"),  value: "#111827" },
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
              {t("buttonPositionLabel")}
            </label>
            <div className="space-y-1.5">
              <PosRadio
                value="br"
                current={position}
                onSelect={setPosition}
                label={t("posBottomRight")}
                hint={t("posBottomRightHint")}
              />
              <PosRadio
                value="bl"
                current={position}
                onSelect={setPosition}
                label={t("posBottomLeft")}
                hint={t("posBottomLeftHint")}
              />
              <PosRadio
                value="tr"
                current={position}
                onSelect={setPosition}
                label={t("posTopRight")}
                hint={t("posTopRightHint")}
              />
              <PosRadio
                value="tl"
                current={position}
                onSelect={setPosition}
                label={t("posTopLeft")}
                hint={t("posTopLeftHint")}
              />
              <PosRadio
                value="inline"
                current={position}
                onSelect={setPosition}
                label={t("posInline")}
                hint={t("posInlineHint")}
              />
            </div>
            {position === "inline" && (
              <div className="mt-3 space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                  <p className="font-bold mb-1">{t("inlineModeWarningTitle")}</p>
                  <p>
                    {t.rich("inlineModeWarningBody", { code: (c) => <code className="bg-white/70 px-1 rounded">{c}</code> })}
                  </p>
                  <p className="mt-2">
                    {t.rich("inlineModeWarningFooter", { strong: (c) => <strong>{c}</strong> })}
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    {t("targetSelectorLabel")}
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
            <h3 className="font-semibold text-gray-900">{t("livePreviewHeading")}</h3>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider bg-gray-100 px-1.5 py-0.5 rounded">
              {t("livePreviewBadge")}
            </span>
          </div>
          <BrowserMock>
            {snippetType === "iframe" ? (
              <div className="absolute inset-2 bg-white border border-emerald-200 rounded shadow-inner flex flex-col items-center justify-center p-2 gap-1.5">
                <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                  {t("previewEmbeddedMenuLabel")}
                </div>
                <div className="text-[10px] text-gray-500 text-center leading-tight">
                  {t("previewEmbeddedMenuDescription")}
                </div>
                <div className="mt-1 px-2 py-1 bg-emerald-500 text-white text-[10px] rounded">
                  {t("previewPickupBadge")}
                </div>
                <div className="flex gap-1 mt-1">
                  <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[8px] rounded">{t("previewCategoryPizzas")}</span>
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[8px] rounded">{t("previewCategoryDrinks")}</span>
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
              ? t("previewDescriptionIframe")
              : snippetType === "button_link"
              ? t("previewDescriptionButtonLink")
              : t("previewDescriptionPopup")}
          </p>
        </div>
      </div>

      {/* ── Generated snippet ────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-semibold text-gray-300">{t("installCodeLabel")}</span>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white transition"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? t("copied") : t("copyCode")}
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
          baseUrl={baseUrl}
          reservationUrl={reservationUrl}
          snippetType={snippetType}
          color={color}
        />
      )}

      {/* ── Facebook Page install ────────────────────────────────────
          GloriaFood-parity: their "facebook-ordering" page tells the
          restaurant to paste a smart link into the Facebook "Start
          Order" action button. Our equivalent is the public order URL
          — Facebook accepts any https URL on that action button, so
          there's no code to embed; just copy and paste. This block
          surfaces the link with one-click copy + the same 3-step
          instructions GloriaFood ships. */}
      <FacebookInstall orderUrl={orderUrl} />

      {/* ── Platform install guide ───────────────────────────────────── */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-blue-900">{t("whereToPasteHeading")}</h3>
        </div>

        <p className="text-sm text-blue-900 leading-relaxed">
          {t.rich("whereToPasteBody", { strong: (c) => <strong>{c}</strong> })}
        </p>

        <div>
          <label className="block text-xs font-semibold text-blue-900 uppercase tracking-wide mb-2">
            {t("platformPickerLabel")}
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
            {t("printInstructions")}
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
  const t = useTranslations("admin.legacyWidget");
  switch (platform) {
    case "wix":
      return (
        <Steps title={t("wixGuideTitle")}>
          <Step n={1}>
            {t.rich("wixStep1", {
              a: (c) => <a href="https://manage.wix.com/account/sites" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{c}</a>,
            })}
          </Step>
          <Step n={2}>{t.rich("wixStep2", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={3}>{t.rich("wixStep3", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={4}>{t.rich("wixStep4", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={5}>{t("wixStep5")}</Step>
          <Step n={6}>
            {t.rich("wixStep6", { em: (c) => <em>{c}</em>, strong: (c) => <strong>{c}</strong> })}
          </Step>
          <Step n={7}>{t.rich("wixStep7", { strong: (c) => <strong>{c}</strong> })}</Step>
          <WarnBox>
            {t.rich("wixWarn1", { strong: (c) => <strong>{c}</strong> })}
          </WarnBox>
          <WarnBox>
            {t.rich("wixWarn2", { strong: (c) => <strong>{c}</strong>, em: (c) => <em>{c}</em>, code: (c) => <code className="bg-gray-100 px-1 rounded text-[10px]">{c}</code> })}
          </WarnBox>
        </Steps>
      );
    case "squarespace":
      return (
        <Steps title={t("squarespaceGuideTitle")}>
          <Step n={1}>{t.rich("squarespaceStep1", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={2}>{t.rich("squarespaceStep2", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={3}>{t.rich("squarespaceStep3", { strong: (c) => <strong>{c}</strong> })}</Step>
        </Steps>
      );
    case "wordpress":
      return (
        <Steps title={t("wordpressGuideTitle")}>
          <Step n={1}>
            {t.rich("wordpressStep1", { strong: (c) => <strong>{c}</strong>, em: (c) => <em>{c}</em> })}
          </Step>
          <Step n={2}>{t.rich("wordpressStep2", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={3}>{t("wordpressStep3")}</Step>
          <Step n={4}>
            {t.rich("wordpressStep4", { strong: (c) => <strong>{c}</strong>, code: (c) => <code className="bg-gray-100 px-1 rounded">{c}</code> })}
          </Step>
        </Steps>
      );
    case "shopify":
      return (
        <Steps title={t("shopifyGuideTitle")}>
          <Step n={1}>{t.rich("shopifyStep1", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={2}>{t.rich("shopifyStep2", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={3}>{t.rich("shopifyStep3", { code: (c) => <code className="bg-gray-100 px-1 rounded">{c}</code> })}</Step>
          <Step n={4}>
            {t.rich("shopifyStep4", { code: (c) => <code className="bg-gray-100 px-1 rounded">{c}</code> })}
          </Step>
          <Step n={5}>{t.rich("shopifyStep5", { strong: (c) => <strong>{c}</strong> })}</Step>
        </Steps>
      );
    case "webflow":
      return (
        <Steps title={t("webflowGuideTitle")}>
          <Step n={1}>{t.rich("webflowStep1", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={2}>{t.rich("webflowStep2", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={3}>{t.rich("webflowStep3", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={4}>{t.rich("webflowStep4", { strong: (c) => <strong>{c}</strong> })}</Step>
        </Steps>
      );
    case "godaddy":
      return (
        <Steps title={t("godaddyGuideTitle")}>
          <Step n={1}>{t.rich("godaddyStep1", { strong: (c) => <strong>{c}</strong> })}</Step>
          <Step n={2}>{t("godaddyStep2")}</Step>
          <Step n={3}>{t("godaddyStep3")}</Step>
          <Step n={4}>{t("godaddyStep4")}</Step>
          <Step n={5}>{t("godaddyStep5")}</Step>
          <WarnBox>
            {t("godaddyWarn")}
          </WarnBox>
        </Steps>
      );
    case "html":
      return (
        <Steps title={t("htmlGuideTitle")}>
          <Step n={1}>{t("htmlStep1")}</Step>
          <Step n={2}>
            {t.rich("htmlStep2", { code: (c) => <code className="bg-gray-100 px-1 rounded">{c}</code> })}
          </Step>
          <Step n={3}>{t.rich("htmlStep3", { code: (c) => <code className="bg-gray-100 px-1 rounded">{c}</code> })}</Step>
          <Step n={4}>{t("htmlStep4")}</Step>
          <Step n={5}>{t("htmlStep5")}</Step>
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
  baseUrl,
  reservationUrl,
  snippetType,
  color,
}: {
  publicId: string;
  /** Platform apex base — used ONLY for the /embed/* token URLs (iframe +
   *  widget.js script), which must stay on the apex. */
  baseUrl: string;
  /** Customer-facing reservation URL on the most-branded domain (used by the
   *  plain HTML button_link the owner pastes on their own site). */
  reservationUrl: string;
  snippetType: "popup_js" | "button_link" | "iframe";
  color: string;
}) {
  const t = useTranslations("admin.legacyWidget");
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
        `<a href="${reservationUrl}"`,
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
  }, [publicId, baseUrl, reservationUrl, snippetType, color]);

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
        <span className="text-xs font-semibold text-gray-300">{t("reservationInstallCodeLabel")}</span>
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
          {copied ? t("copied") : t("copyCode")}
        </button>
      </div>
      <pre className="p-4 text-xs text-gray-100 overflow-x-auto whitespace-pre">{snippet}</pre>
    </div>
  );
}

/**
 * Facebook Page install block. GloriaFood-equivalent of their
 * /facebook-ordering walkthrough: paste the restaurant's order URL
 * into Facebook's "Start Order" page action button — Facebook
 * accepts any https link there, so there's nothing JS-related to
 * embed. Just the link + the 3 manual clicks the restaurant has to
 * make on Facebook's side.
 *
 * Implementation note: no API or persisted state — the link is
 * derived from the restaurant's slug at render time. If the slug
 * changes, the link auto-updates on the next page render.
 */
function FacebookInstall({ orderUrl }: { orderUrl: string }) {
  const t = useTranslations("admin.legacyWidget");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(orderUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop — clipboard blocked (e.g. insecure context). Owner can
         still triple-click the field below and Ctrl-C manually. */
    }
  };
  return (
    <div className="rounded-xl border border-[#1877F2]/30 bg-[#1877F2]/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <FacebookGlyph className="w-5 h-5 text-[#1877F2]" />
        <h3 className="font-semibold text-gray-900">{t("facebookHeading")}</h3>
      </div>

      <p className="text-sm text-gray-700 leading-relaxed">
        {t.rich("facebookIntro", { strong: (c) => <strong>{c}</strong> })}
      </p>

      <div>
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">
          {t("facebookSmartLinkLabel")}
        </label>
        <div className="flex items-stretch gap-2">
          <input
            readOnly
            value={orderUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm font-mono text-gray-800 focus:ring-2 focus:ring-[#1877F2] focus:outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1877F2] hover:bg-[#1466d1] text-white text-sm font-semibold transition flex-shrink-0"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? t("copied") : t("copyLink")}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          {t("facebookSmartLinkHint")}
        </p>
      </div>

      <ol className="space-y-3 text-sm text-gray-800">
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1877F2] text-white text-xs font-bold flex items-center justify-center">1</span>
          <span>
            {t.rich("facebookStep1", { strong: (c) => <strong>{c}</strong> })}
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1877F2] text-white text-xs font-bold flex items-center justify-center">2</span>
          <span>
            {t.rich("facebookStep2", { strong: (c) => <strong>{c}</strong> })}
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1877F2] text-white text-xs font-bold flex items-center justify-center">3</span>
          <span>
            {t.rich("facebookStep3", { strong: (c) => <strong>{c}</strong> })}
          </span>
        </li>
      </ol>

      <div className="rounded-lg bg-white border border-gray-200 p-3 flex items-start gap-2">
        <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-gray-600 leading-relaxed">
          {t("facebookSmartLinkChannels")}
        </p>
      </div>

      <a
        href="https://www.facebook.com/pages/?category=your_pages"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1877F2] hover:text-[#1466d1] transition"
      >
        {t("facebookOpenMyPages")}
        <ExternalLink className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}
