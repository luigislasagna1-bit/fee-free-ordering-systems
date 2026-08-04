"use client";
import { useState } from "react";

type Preview = { email: string; customers: number; orders: number; restaurants: number; hasMarketplaceAccount: boolean };
type EraseResult = { ok: boolean; scope: string; counts: Record<string, number>; stripeStatus: string };

/**
 * Support tool (superadmin) for privacy/erasure requests. English-only, like the
 * rest of the platform-admin surface. Preview shows what would be erased; the
 * Erase button is a destructive, confirmed platform-wide anonymize.
 */
export function DataRequestsClient() {
  const [email, setEmail] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<EraseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doPreview() {
    setBusy(true); setError(null); setResult(null); setPreview(null);
    try {
      const res = await fetch(`/api/superadmin/data-requests?email=${encodeURIComponent(email.trim())}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Preview failed");
      setPreview(json);
    } catch (e) { setError(e instanceof Error ? e.message : "Preview failed"); }
    finally { setBusy(false); }
  }

  async function doErase() {
    if (!confirm(`Permanently anonymize ALL data for ${email.trim()} across every restaurant? This cannot be undone.`)) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/superadmin/data-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), scope: "platform" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Erase failed");
      setResult(json);
      setPreview(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Erase failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-1">Data-rights requests</h1>
      <p className="text-sm text-gray-500 mb-6">
        Fulfill a customer&apos;s &ldquo;delete my data&rdquo; request. Enter the email, preview the match,
        then anonymize. Order/reservation records are kept in anonymized form for tax retention.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="customer@example.com"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={doPreview}
          disabled={busy || !email.includes("@")}
          className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-50"
        >
          Preview
        </button>
      </div>

      {error && <div className="text-sm text-red-600 mb-4">{error}</div>}

      {preview && (
        <div className="border border-gray-200 rounded-xl p-4 mb-4">
          <div className="text-sm text-gray-700 mb-3">
            Found <strong>{preview.customers}</strong> customer record(s) across{" "}
            <strong>{preview.restaurants}</strong> restaurant(s), <strong>{preview.orders}</strong> order(s)
            {preview.hasMarketplaceAccount ? ", and a marketplace account" : ""}.
          </div>
          <button
            onClick={doErase}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-50"
          >
            Erase all data (platform-wide)
          </button>
        </div>
      )}

      {result && (
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-4">
          <div className="text-sm font-medium text-emerald-800 mb-2">Erased ({result.scope}). Stripe: {result.stripeStatus}.</div>
          <pre className="text-xs text-emerald-900 whitespace-pre-wrap">{JSON.stringify(result.counts, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
