"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Link2 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Superadmin control to attribute a restaurant to a reseller (or clear it).
 * The primary use: retro-fixing signups whose ?ref= attribution was lost, by
 * assigning them to the reseller who actually referred them. Posts to
 * /api/superadmin/restaurants/[id]/assign-reseller, which validates the target
 * reseller is approved and notifies them.
 */
export function AssignResellerControl({
  restaurantId,
  currentResellerProfileId,
  resellers,
}: {
  restaurantId: string;
  currentResellerProfileId: string | null;
  resellers: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(currentResellerProfileId ?? "");
  const [busy, setBusy] = useState(false);

  const dirty = (selected || null) !== (currentResellerProfileId || null);

  async function save() {
    if (busy || !dirty) return;
    // Confirm the destructive direction (removing an existing attribution).
    if (currentResellerProfileId && !selected) {
      if (!confirm("Remove this restaurant's reseller attribution? It will become a direct (unattributed) signup.")) return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/superadmin/restaurants/${restaurantId}/assign-reseller`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resellerProfileId: selected || null }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(data.error || "Update failed");
        return;
      }
      toast.success(selected ? "Reseller assigned" : "Attribution cleared");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        Assign / change reseller
      </label>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={selected}
          disabled={busy}
          onChange={(e) => setSelected(e.target.value)}
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100"
        >
          <option value="">— Direct (no reseller) —</option>
          {resellers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={busy || !dirty}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-40"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
          Save
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-1.5 leading-snug">
        Use this to link a restaurant to the reseller who referred them (the reseller is notified). Past commissions aren&apos;t rewritten.
      </p>
    </div>
  );
}
