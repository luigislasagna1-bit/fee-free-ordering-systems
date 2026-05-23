"use client";
import { useMemo, useState } from "react";
import {
  Copy, Check, AlertCircle, Info, Sparkles, Printer,
  ChevronDown, ChevronRight,
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

const DEFAULT_LABEL = "See MENU & Order";
const DEFAULT_COLOR = "#ef4444";

export function LegacyWidgetClient({
  publicId,
  baseUrl,
  isPublished,
}: {
  publicId: string;
  baseUrl: string;
  isPublished: boolean;
}) {
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [position, setPosition] = useState<Position>("br");
  const [customSelector, setCustomSelector] = useState("#order-button");
  const [platform, setPlatform] = useState<string>("wix");
  const [copied, setCopied] = useState(false);

  /** Build the snippet on the fly. Only emit attributes that differ from
   *  defaults so the paste stays minimal — fewer things for restaurants
   *  to fat-finger. */
  const snippet = useMemo(() => {
    const lines = [
      `<!-- Fee Free Ordering widget -->`,
      `<script src="${baseUrl}/embed/widget.js"`,
      `        data-restaurant="${publicId}"`,
    ];
    if (label !== DEFAULT_LABEL) lines.push(`        data-label="${escapeHtml(label)}"`);
    if (color.toLowerCase() !== DEFAULT_COLOR) lines.push(`        data-color="${color}"`);
    if (position === "inline" && customSelector.trim()) {
      lines.push(`        data-target="${escapeHtml(customSelector.trim())}"`);
    }
    // Position presets (br/bl/tr/tl) aren't supported by widget.js yet —
    // only floating-br is the default and data-target overrides to
    // inline. We surface bl/tr/tl in the UI as "Coming soon" so the user
    // sees the option but can't pick a broken combo. Note: for now they
    // collapse to BR if selected (no data attribute emitted).
    lines[lines.length - 1] = lines[lines.length - 1] + "";
    lines.push(`        async defer></script>`);
    return lines.join("\n");
  }, [baseUrl, publicId, label, color, position, customSelector]);

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

      {/* ── Customizer (controls + live preview) ─────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Controls */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <h3 className="font-semibold text-gray-900">Customize</h3>
          </div>

          {/* Label */}
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

          {/* Color */}
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
                hint="Default. Always visible no matter how far the customer scrolls."
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
              <div className="mt-3">
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
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                  Add an empty <code className="bg-gray-100 px-1 rounded">&lt;div id=&quot;order-button&quot;&gt;&lt;/div&gt;</code> wherever
                  you want the button to appear. The widget will fill it in.
                </p>
              </div>
            )}
          </div>
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
          </BrowserMock>
          <p className="text-[11px] text-gray-500 leading-relaxed">
            Clicking the real button on your site opens a full-screen modal
            with your complete ordering UI — pickup/delivery toggle, menu
            categories, cart, checkout. Not previewed here.
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
