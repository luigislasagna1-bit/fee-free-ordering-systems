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
  /** Roadmap teaser flag. When true, restaurant-facing UI shows the
   *  add-on as "Coming Soon" — visible but unsubscribable. Flip OFF
   *  when the implementation lands. */
  comingSoon: boolean;
  displayOrder: number;
  enabledFeatures: string;
  requiredDependencies: string;
  stripeProductId: string | null;
  stripePriceId: string | null;
};

/**
 * Per-row draft state for the price input.
 *
 * Why a separate draft: the canonical store is `monthlyPriceCents` (an integer).
 * If we bind <input value={(cents/100).toFixed(2)}>, the visible string is
 * recomputed on every keystroke — typing "1" displays as "1.00" with the
 * cursor at the end, and the next digit you press ("0") gets appended as
 * "1.000" which then re-rounds to 100 cents → "1.00". You're stuck.
 *
 * Drafts decouple input UX (a free-form string the user is typing) from the
 * canonical numeric value (only parsed on Save). On a successful save we sync
 * the draft back to the canonical formatted price.
 */
function centsToDraft(cents: number): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2);
}

function draftToCents(s: string): number {
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function SuperadminAddOnsClient({ initial }: { initial: AddOnRow[] }) {
  const [rows, setRows] = useState<AddOnRow[]>(initial);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(initial.map((r) => [r.id, centsToDraft(r.monthlyPriceCents)]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField<K extends keyof AddOnRow>(id: string, key: K, value: AddOnRow[K]) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  }

  async function save(row: AddOnRow) {
    setSavingId(row.id);
    setError(null);
    // Resolve the price-cents from the draft string at save time. This is
    // the only place we parse — keystrokes never trigger a re-format.
    const draft = priceDrafts[row.id] ?? "";
    const cents = draftToCents(draft);
    try {
      const r = await fetch("/api/superadmin/add-ons", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          name: row.name,
          description: row.description,
          monthlyPriceCents: cents,
          // trialDays removed — we no longer offer trials. The column
          // is still on the AddOn schema for legacy data but ignored
          // everywhere (see commit faaf9d8 + the Stripe add-on
          // checkout route which no longer passes trial_period_days).
          isActive: row.isActive,
          comingSoon: row.comingSoon,
          displayOrder: row.displayOrder,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data?.error || "save_failed");
      } else if (data?.addOn) {
        setRows((rs) => rs.map((x) => (x.id === row.id ? data.addOn : x)));
        // Re-format the draft to canonical "X.XX" only after a successful
        // save, so the visible value matches what's stored without the
        // mid-typing reformat we just removed.
        setPriceDrafts((d) => ({ ...d, [row.id]: centsToDraft(data.addOn.monthlyPriceCents) }));
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

      <p className="text-xs text-gray-500">
        Type a price like <code className="bg-gray-100 px-1 rounded">19</code> or{" "}
        <code className="bg-gray-100 px-1 rounded">14.99</code>, then click{" "}
        <strong>Save</strong>. After Save shows the new price, click{" "}
        <strong>Sync</strong> to create the Stripe Product + Price.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="text-left px-3 py-2">Slug</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">$/mo</th>
              <th className="text-left px-3 py-2">Active</th>
              <th className="text-left px-3 py-2" title="Show as 'Coming Soon' to restaurants — visible but unsubscribable">Coming&nbsp;Soon</th>
              <th className="text-left px-3 py-2">Stripe</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const synced = !!r.stripePriceId;
              const draft = priceDrafts[r.id] ?? "";
              const draftCents = draftToCents(draft);
              const draftDiffersFromSaved = draftCents !== r.monthlyPriceCents;
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
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-xs">$</span>
                      <input
                        // type=text rather than type=number so the browser
                        // doesn't strip trailing zeroes or eat the decimal
                        // point mid-typing. We validate on save.
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        className={`w-24 border rounded px-2 py-1 ${
                          draftDiffersFromSaved
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-gray-200"
                        }`}
                        value={draft}
                        onChange={(e) =>
                          setPriceDrafts((d) => ({ ...d, [r.id]: e.target.value }))
                        }
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={r.isActive}
                      onChange={(e) => updateField(r.id, "isActive", e.target.checked)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={r.comingSoon}
                      onChange={(e) => updateField(r.id, "comingSoon", e.target.checked)}
                      title="When checked, restaurants see this add-on as 'Coming Soon' and cannot subscribe."
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
                        className={`px-3 py-1 text-xs font-medium rounded border ${
                          draftDiffersFromSaved
                            ? "border-emerald-400 bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            : "border-gray-300 bg-white hover:bg-gray-50"
                        } disabled:opacity-50`}
                      >
                        {savingId === r.id ? "Saving…" : draftDiffersFromSaved ? "Save *" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => syncToStripe(r)}
                        disabled={syncingId === r.id || r.monthlyPriceCents <= 0 || draftDiffersFromSaved}
                        title={
                          draftDiffersFromSaved
                            ? "Save your price changes first"
                            : r.monthlyPriceCents <= 0
                            ? "Set a non-zero price first"
                            : "Push Product + Price to Stripe"
                        }
                        className="px-3 py-1 text-xs font-medium rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-gray-300 flex items-center gap-1"
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
