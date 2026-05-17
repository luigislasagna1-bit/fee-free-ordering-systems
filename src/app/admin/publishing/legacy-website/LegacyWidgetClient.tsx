"use client";
import { useState } from "react";
import { Copy, Check, AlertCircle } from "lucide-react";

export function LegacyWidgetClient({
  publicId,
  baseUrl,
  isPublished,
}: {
  publicId: string;
  baseUrl: string;
  isPublished: boolean;
}) {
  const snippet =
    `<!-- Fee Free Ordering widget -->\n` +
    `<script src="${baseUrl}/embed/widget.js"\n` +
    `        data-restaurant="${publicId}"\n` +
    `        data-label="Order Online"\n` +
    `        data-color="#ef4444"\n` +
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
              You can copy this code now, but the widget won't accept orders until you finish setup
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

      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="font-semibold text-gray-900">Preview</h3>
        <p className="text-sm text-gray-600 mt-1">
          A live preview of how the launcher button will appear:
        </p>
        <div className="mt-3 relative h-40 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden">
          <div className="absolute bottom-4 right-4">
            <button
              type="button"
              disabled
              className="px-5 py-3 rounded-full font-semibold text-white shadow-lg"
              style={{ background: "#ef4444" }}
            >
              Order Online
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
