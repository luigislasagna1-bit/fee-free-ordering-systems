"use client";

import { useState } from "react";
import { Loader2, CreditCard } from "lucide-react";

/**
 * Posts to /api/reseller/billing-portal and redirects to Stripe's
 * Customer Portal, where the reseller can update their card, view
 * past invoices, cancel, or resume. Returning from the portal lands
 * back on /reseller/branding.
 */
export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/billing-portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not open billing portal");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not open billing portal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={openPortal}
        disabled={busy}
        className="inline-flex items-center gap-1.5 border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
        Manage billing
      </button>
      {error && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
