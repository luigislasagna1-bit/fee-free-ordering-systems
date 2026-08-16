"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

/**
 * "Open as the restaurant" — impersonates the restaurant (the existing
 * superadmin impersonation cookie) and lands on ITS call page with the
 * timeline open, so the operator sees exactly what the owner saw when they
 * pressed Report. Superadmin-only server-side (the impersonate route gates).
 */
export default function OpenAsRestaurantButton({ restaurantId, callId }: { restaurantId: string; callId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/superadmin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
      });
      if (!res.ok) throw new Error();
      router.push(`/admin/phone-ordering/calls/${callId}?debug=1`);
      router.refresh();
    } catch {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-60"
      title="Impersonate the restaurant and open this call in its dashboard"
    >
      <ExternalLink className="w-3.5 h-3.5" /> {busy ? "Opening…" : "Open as the restaurant"}
    </button>
  );
}
