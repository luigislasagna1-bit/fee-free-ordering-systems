"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Tag } from "lucide-react";

/**
 * Editor for the reseller's imprint string. The string is appended to
 * receipt footers + transactional email footers for every restaurant
 * attributed to this reseller. Max 200 chars to keep it on one line of
 * a 80mm thermal receipt without wrapping.
 */
export function ImprintClient({
  initialImprint,
  companyName,
}: {
  initialImprint: string;
  companyName: string | null;
}) {
  const [imprint, setImprint] = useState(initialImprint);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imprint: imprint.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not save");
        return;
      }
      setSavedAt(Date.now());
    } catch {
      setError("Could not save");
    } finally {
      setBusy(false);
    }
  }

  // Suggest a starter imprint based on company name if the field is empty
  // — gets a brand-new reseller from "blank" to "looks reasonable" in one
  // click. They can edit before saving.
  const suggested = companyName
    ? `Supported by ${companyName}`
    : "Supported by Your Partner LLC | contact@partner.com";

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1 text-xs font-semibold mb-2">
          <Tag className="w-3.5 h-3.5" /> Branding
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Imprint</h1>
        <p className="text-sm text-gray-500">
          One line of contact info that appears at the bottom of receipts + customer emails
          for every restaurant you bring on. Gives you visibility on every receipt that prints
          and every email that goes out.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
          Imprint text
        </label>
        <textarea
          value={imprint}
          onChange={(e) => setImprint(e.target.value.slice(0, 200))}
          rows={3}
          placeholder={suggested}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[11px] text-gray-400">
            Max 200 characters. Use &quot; | &quot; (pipe) to separate name, email, phone — keeps it on one
            line of a thermal receipt.
          </span>
          <span className="text-[11px] text-gray-400">{imprint.length} / 200</span>
        </div>

        {!imprint && (
          <button
            type="button"
            onClick={() => setImprint(suggested)}
            className="mt-2 text-xs text-emerald-700 font-semibold hover:underline"
          >
            Use suggested: &ldquo;{suggested}&rdquo;
          </button>
        )}

        <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4">
          <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">
            Preview — receipt footer
          </div>
          <pre className="text-[11px] font-mono text-gray-700 whitespace-pre-wrap leading-relaxed">
{`──────────────────────────────
  Thank you for your order!
  ${imprint || suggested}
──────────────────────────────`}
          </pre>
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-5 py-2.5 rounded-lg disabled:opacity-50 transition"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Save imprint
          </button>
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
        <strong>Heads up:</strong> imprint applies to all restaurants attributed to you. If you
        want different imprints per restaurant, that&apos;ll be a future feature. For now, keep
        it generic to your brand.
      </div>
    </div>
  );
}
