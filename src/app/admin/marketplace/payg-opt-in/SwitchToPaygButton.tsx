"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight } from "lucide-react";

/**
 * Submit button for the Monthly→PAYG switch flow.
 *
 *   mode="schedule" → POSTs to /api/admin/marketplace/switch-to-payg.
 *                     Stripe gets cancel_at_period_end=true on the
 *                     Monthly sub; local MarketplaceListing flag is set.
 *                     Refresh re-renders the page in "switch pending" state.
 *
 *   mode="undo"     → DELETEs to the same endpoint. Cancels the pending
 *                     switch; restaurant stays on Monthly. Refresh re-
 *                     renders the page in the initial schedule state.
 */
export function SwitchToPaygButton({ mode }: { mode: "schedule" | "undo" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/marketplace/switch-to-payg", {
        method: mode === "schedule" ? "POST" : "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Try again.");
        return;
      }
      // Server-rendered page reads from the database — refresh to pick
      // up the new state. router.refresh() re-runs the server component
      // without a full reload (preserves scroll, animations, etc.).
      router.refresh();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "schedule") {
    return (
      <>
        <button
          onClick={run}
          disabled={busy}
          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold py-3 px-5 rounded-xl text-sm flex items-center justify-center gap-2 shadow transition"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Confirm — switch to Pay-As-You-Go at cycle end
          {!busy && <ArrowRight className="w-4 h-4" />}
        </button>
        {error && (
          <p className="mt-2 text-center text-xs text-red-600">{error}</p>
        )}
      </>
    );
  }

  // undo
  return (
    <>
      <button
        onClick={run}
        disabled={busy}
        className="mt-3 w-full bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-800 font-semibold py-2.5 px-4 rounded-lg border border-gray-200 text-sm flex items-center justify-center gap-2 transition"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        Stay on Monthly — undo the switch
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-red-600">{error}</p>
      )}
    </>
  );
}
