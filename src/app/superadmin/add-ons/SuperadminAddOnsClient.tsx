"use client";
import { useState } from "react";
import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

type AddOnRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  yearlyPriceCents: number | null;
  trialDays: number | null;
  isActive: boolean;
  displayOrder: number;
  enabledFeatures: string;
  requiredDependencies: string;
  stripeProductId: string | null;
  stripePriceId: string | null;
};

export function SuperadminAddOnsClient({ initial }: { initial: AddOnRow[] }) {
  const [rows, setRows] = useState<AddOnRow[]>(initial);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof AddOnRow>(id: string, key: K, value: AddOnRow[K]) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  async function save(row: AddOnRow) {
    setSavingId(row.id);
    setError(null);
    try {
      const r = await fetch("/api/superadmin/add-ons", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          name: row.name,
          description: row.description,
          monthlyPriceCents: row.monthlyPriceCents,
          trialDays: row.trialDays ?? 0,
          isActive: row.isActive,
          displayOrder: row.displayOrder,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "save_failed");
      } else if (data?.addOn) {
        setRows((rs) => rs.map((x) => (x.id === row.id ? data.addOn : x)));
      }
    } catch (e: any) {
      setError(e?.message || "save_failed");
    } finally {
      setSavingId(null);
    }
  }

  async function syncToStripe(row: AddOnRow) {
    setSyncingId(row.id);
    setError(null);
    try {
      const r = await fetch(`/api/superadmin/add-ons/${row.id}/sync`, {
        method: "POST",
      });
      const data = await r.json();
      if (!r.ok || !data?.ok) {
        setError(data?.error || "sync_failed");
      } else {
        setRows((rs) =>
          rs.map((x) =>
            x.id === row.id
              ? { ...x, stripeProductId: data.stripeProductId, stripePriceId: data.stripePriceId }
              : x
          )
        );
      }
    } catch (e: any) {
      setError(e?.message || "sync_failed");
    } finally {
      setSyncingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Slug</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">$/mo</th>
              <th className="text-left px-3 py-2">Trial days</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-left px-3 py-2">Stripe</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const synced = !!r.stripePriceId;
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2"><code className="text-xs">{r.slug}</code></td>
                  <td className="px-3 py-2">
                    <input
                      className="w-full border border-gray-200 rounded px-2 py-1"
                      value={r.name}
                      onChange={(e) => updateField(r.id, "name", e.target.value)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-24 border border-gray-200 rounded px-2 py-1"
                      value={(r.monthlyPriceCents / 100).toFixed(2)}
                      onChange={(e) =>
                        updateField(r.id, "monthlyPriceCents", Math.round(parseFloat(e.target.value || "0") * 100))
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0}
                      className="w-20 border border-gray-200 rounded px-2 py-1"
                      value={r.trialDays ?? 0}
                      onChange={(e) => updateField(r.id, "trialDays", parseInt(e.target.value || "0", 10))}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={r.isActive}
                      onChange={(e) => updateField(r.id, "isActive", e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {synced ? (
                      <span className="text-green-700 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Synced
                      </span>
                    ) : (
                      <span className="text-gray-400">Not synced</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => save(r)}
                        disabled={savingId === r.id}
                        className="px-3 py-1 text-xs font-medium rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        {savingId === r.id ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => syncToStripe(r)}
                        disabled={syncingId === r.id || r.monthlyPriceCents <= 0}
                        title={
                          r.monthlyPriceCents <= 0
                            ? "Set a non-zero price first"
                            : "Push Product + Price to Stripe"
                        }
                        className="px-3 py-1 text-xs font-medium rounded bg-orange-500 text-white hover:bg-orange-600 disabled:bg-gray-300 flex items-center gap-1"
                      >
                        {syncingId === r.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        Sync
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
