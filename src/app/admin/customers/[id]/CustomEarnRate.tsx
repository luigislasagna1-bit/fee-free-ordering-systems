"use client";
import { useState } from "react";
import { Percent, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";

/**
 * Personal earn-rate override on the admin customer-detail page ("this regular
 * earns double"). A percent of the earn basis (10 = 10% back) that beats the
 * restaurant base rate AND any VIP group rate — for this customer only.
 * Personal > highest group > base; resolution lives in reward-earn-rate.ts.
 * Saves via PATCH /api/admin/customers/[id] (restaurant-scoped; null clears).
 * Luigi 2026-07-19.
 */
export function CustomEarnRate({
  customerId, labelPlural, initialPercent,
}: {
  customerId: string;
  labelPlural: string | null;
  initialPercent: number | null;
}) {
  const t = useTranslations("admin.rewards");
  // Reused generic "Save" (translated ×38 alongside the VIP group strings).
  const tGroups = useTranslations("admin.customerGroups");
  const tToasts = useTranslations("admin.toasts");
  const label = labelPlural?.trim() || t("defaultPlural");

  const [pct, setPct] = useState<number | null>(initialPercent);
  const [draft, setDraft] = useState(initialPercent != null ? String(initialPercent) : "");
  const [busy, setBusy] = useState(false);

  // Mirror of the server clamp (≤0 clears, else ≤100 at 2dp) so the input
  // shows what stuck — a typed 0 must CLEAR, never become a 0.01% downgrade.
  const clampPct = (n: number) => (n <= 0 ? null : Math.round(Math.min(100, n) * 100) / 100);
  const parsed = draft.trim() === "" ? null : parseFloat(draft);
  const valid = parsed === null || Number.isFinite(parsed);
  const dirty = valid && (parsed === null ? pct != null : parsed !== pct);

  const save = async (value: number | null) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardEarnPercent: value }),
      });
      if (!res.ok) throw new Error();
      setPct(value);
      setDraft(value != null ? String(value) : "");
      toast.success(tToasts("saved"));
    } catch {
      toast.error(tToasts("saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center gap-2 mb-1">
        <Percent className="w-5 h-5 text-emerald-600" />
        <h2 className="font-semibold text-gray-900">{t("personalRateTitle")}</h2>
        <HelpTip text={t("groupRatesExplainer")} />
      </div>
      <p className="text-sm text-gray-500 mb-3">{t("personalRateDesc", { label })}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
          <input
            type="number" min={0.01} max={100} step="0.01"
            value={draft}
            placeholder={t("ratePlaceholder")}
            onChange={(e) => setDraft(e.target.value)}
            className="w-24 px-3 py-2 text-sm text-gray-900 focus:outline-none"
          />
          <span className="px-2.5 flex items-center bg-gray-50 text-gray-500 text-sm border-l border-gray-300">%</span>
        </div>
        {dirty && (
          <button
            type="button"
            onClick={() => save(parsed === null ? null : clampPct(parsed))}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {tGroups("memberLabelSave")}
          </button>
        )}
        {!dirty && pct != null && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={busy}
            title={t("rateClear")}
            aria-label={t("rateClear")}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
