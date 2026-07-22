"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Bike } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Superadmin control: set (or clear) a FLAT per-delivery FeeFree fee override for
 * one restaurant — what FeeFree bills that store per delivered order (platform
 * revenue, set per store based on unit economics; never customer-facing). When
 * set, it replaces the automatic distance tiers ($7.99/$8.99/$9.99) for this
 * store; blank reverts to the tiers. $0 comps the store. Posts to
 * /api/superadmin/restaurants/[id]/feefree-fee. Frozen onto the assignment at
 * delivery, so a change never re-bills past deliveries. English-only (internal).
 */
export function FeeFreeFeeControl({
  restaurantId,
  currentFeeCents,
  inServiceArea,
}: {
  restaurantId: string;
  currentFeeCents: number | null;
  inServiceArea: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState<string>(
    currentFeeCents != null ? (currentFeeCents / 100).toFixed(2) : "",
  );
  const [busy, setBusy] = useState(false);

  // Dollar input → cents (or null when blank). Invalid (negative / NaN) blocks save.
  const trimmed = value.trim();
  const parsedCents = trimmed === "" ? null : Math.round(parseFloat(trimmed) * 100);
  const parseError = trimmed !== "" && (parsedCents === null || !Number.isFinite(parsedCents) || parsedCents < 0);
  const dirty = !parseError && (parsedCents ?? null) !== (currentFeeCents ?? null);

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/superadmin/restaurants/${restaurantId}/feefree-fee`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ perDeliveryFeeCents: parsedCents }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || "Update failed");
        return;
      }
      toast.success(parsedCents == null ? "Reverted to distance tiers" : "Flat fee saved");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        Per-delivery fee override
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[140px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={value}
            disabled={busy}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Auto (distance tiers)"
            className="w-full border border-gray-300 rounded-lg pl-6 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
          />
        </div>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bike className="w-4 h-4" />}
          Save
        </button>
      </div>
      {parseError && (
        <p className="text-[11px] text-red-500 mt-1">Enter a non-negative dollar amount, or leave blank for the automatic tiers.</p>
      )}
      <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
        Flat fee FeeFree bills this store per delivered order. <strong>Blank = automatic distance tiers</strong> ($7.99/$8.99/$9.99). $0 comps the store. Frozen at delivery — never re-bills past deliveries.
        {!inServiceArea && (
          <span className="block mt-1 text-amber-600">Note: this store is outside the FeeFree service area, so FeeFree isn&apos;t offered here yet — an override only takes effect once it is.</span>
        )}
      </p>
    </div>
  );
}
