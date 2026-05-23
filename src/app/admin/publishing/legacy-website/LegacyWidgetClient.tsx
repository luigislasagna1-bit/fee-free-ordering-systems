"use client";
import { useState } from "react";
import { Copy, Check, AlertCircle, Info } from "lucide-react";

export function LegacyWidgetClient({
  publicId,
  baseUrl,
  isPublished,
}: {
  publicId: string;
  baseUrl: string;
  isPublished: boolean;
}) {
  // Snippet kept minimal — we deliberately do NOT hardcode data-label or
  // data-color. The widget.js loader has sensible defaults ("See MENU &
  // Order", red) and restaurants who want to override can add the
  // attributes themselves. The fewer attributes in the snippet the
  // smaller the surface for restaurants to break things by accident.
  const snippet =
    `<!-- Fee Free Ordering widget -->\n` +
    `<script src="${baseUrl}/embed/widget.js"\n` +
    `        data-restaurant="${publicId}"\n` +
    `        async defer></script>`;

  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — older browsers
    }
  }

  return (
    <div className="space-y-4">
      {!isPublished && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-orange-900">
            <p className="font-medium">Not yet published</p>
            <p className="mt-0.5 text-orange-800">
              You can copy this code now, but the widget won&apos;t accept orders until you finish setup
              and click Publish on the previous page.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-gray-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
          <span className="text-xs font-medium text-gray-300">Install code</span>
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <pre className="p-4 text-xs text-gray-100 overflow-x-auto whitespace-pre">{snippet}</pre>
      </div>

      {/* Platform-specific install notes. The big trap is restaurants
       *  using Wix/Squarespace "Embed HTML" widgets — those run scripts
       *  inside a sandboxed iframe sized by the widget element, and our
       *  modal cannot escape that iframe. Restaurants need to use the
       *  CMS's "Custom Code" / site-wide script injection instead. */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900 space-y-2">
          <p className="font-semibold">Where to paste this code (important!)</p>
          <p className="text-blue-800 leading-relaxed">
            Paste the code into your website&apos;s <strong>site-wide custom code</strong> area
            (where Google Analytics / Facebook Pixel scripts go) — NOT into an
            inline &quot;Embed HTML&quot; element. Most website builders sandbox embed
            elements in tiny iframes, which prevents the ordering modal from
            opening at full size.
          </p>
          <ul className="text-blue-800 text-xs leading-relaxed space-y-1 mt-2 list-disc list-inside">
            <li><strong>Wix:</strong> Settings → Advanced → Custom Code → <em>Add Custom Code</em> → choose <em>Body — end</em></li>
            <li><strong>Squarespace:</strong> Settings → Advanced → Code Injection → <em>Footer</em></li>
            <li><strong>WordPress:</strong> add to <em>footer.php</em> just before <code className="bg-blue-100 px-1 rounded">&lt;/body&gt;</code>, or use a plugin like <em>Insert Headers and Footers</em></li>
            <li><strong>Shopify:</strong> Online Store → Themes → Edit code → <em>theme.liquid</em> → just before <code className="bg-blue-100 px-1 rounded">&lt;/body&gt;</code></li>
            <li><strong>Plain HTML site:</strong> paste anywhere before <code className="bg-blue-100 px-1 rounded">&lt;/body&gt;</code></li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">Preview</h3>
        <p className="text-sm text-gray-600 mt-1">
          A live preview of how the launcher button will appear on your site:
        </p>
        <div className="mt-3 relative h-40 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden">
          <div className="absolute bottom-4 right-4">
            <button
              type="button"
              disabled
              className="font-bold text-white shadow-lg"
              style={{
                background: "#ef4444",
                padding: "18px 36px",
                fontSize: "18px",
                borderRadius: "10px",
                minWidth: "200px",
              }}
            >
              See MENU &amp; Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
