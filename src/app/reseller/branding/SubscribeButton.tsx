"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Click → POST /api/reseller/subscribe → redirect to the Stripe Checkout URL
 * returned. On Checkout completion, Stripe redirects back to
 * /reseller/branding?subscribed=1 and the webhook updates the profile.
 */
export function SubscribeButton({
  tier,
  label,
}: {
  tier: "basic" | "full";
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start checkout");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not start checkout");
    } finally {
      // Don't reset busy on success — page is navigating away.
      // Only matters on error: leave the button enabled so they can retry.
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={subscribe}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg disabled:opacity-50 transition"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </button>
      {error && (
        <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">{error}</div>
      )}
    </div>
  );
}
