"use client";
import { useEffect, useState, useCallback } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2, X, Sparkles } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { formatCurrency as fmtCurrency } from "@/lib/utils";

type Rule = {
  id: string; active: boolean; triggerType: string;
  earnAmount: number | null; earnPercent: number | null;
  orderThreshold: number | null; nthInterval: number | null;
  startsAt: string | null; endsAt: string | null; label: string | null;
};

/**
 * "Ways to earn" — configurable Reward Dollars earn rules/campaigns on the admin
 * Rewards page. Sits on top of the base %-back. Restaurant-scoped CRUD via
 * /api/admin/reward-rules. Luigi 2026-06-27.
 */
export function EarnRulesEditor({ currency, rewardLabelPlural }: { currency: string; rewardLabelPlural: string }) {
  const t = useTranslations("admin.rewards.rules");
  const fmt = (n: number) => fmtCurrency(n, currency);

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [triggerType, setTriggerType] = useState("first_order");
  const [amountKind, setAmountKind] = useState<"flat" | "percent">("flat");
  const [amount, setAmount] = useState("");
  const [orderThreshold, setOrderThreshold] = useState("");
  const [nthInterval, setNthInterval] = useState("5");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [label, setLabel] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reward-rules");
      const data = await res.json();
      setRules(Array.isArray(data.rules) ? data.rules : []);
    } catch { /* keep */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  // signup can only be a flat amount (no order basis). Keep the UI honest.
  const percentAllowed = triggerType !== "signup";
  useEffect(() => { if (!percentAllowed && amountKind === "percent") setAmountKind("flat"); }, [percentAllowed, amountKind]);

  const summary = (r: Rule) => {
    const amt = r.earnAmount && r.earnAmount > 0 ? fmt(r.earnAmount) : r.earnPercent ? `${r.earnPercent}%` : "—";
    const base =
      r.triggerType === "signup" ? t("sumSignup", { amount: amt })
        : r.triggerType === "first_order" ? t("sumFirstOrder", { amount: amt })
        : r.triggerType === "order_over" ? t("sumOrderOver", { amount: amt, threshold: fmt(r.orderThreshold ?? 0) })
        : t("sumNth", { amount: amt, n: r.nthInterval ?? 0 });
    const window = r.startsAt || r.endsAt
      ? ` · ${r.startsAt ? new Date(r.startsAt).toLocaleDateString() : "…"}–${r.endsAt ? new Date(r.endsAt).toLocaleDateString() : "…"}`
      : "";
    return base + window;
  };

  const create = async () => {
    setSaving(true);
    try {
      const payload: any = { triggerType, label: label || undefined, startDate: startDate || undefined, endDate: endDate || undefined };
      if (amountKind === "flat") payload.earnAmount = parseFloat(amount) || 0;
      else payload.earnPercent = parseFloat(amount) || 0;
      if (triggerType === "order_over") payload.orderThreshold = parseFloat(orderThreshold) || 0;
      if (triggerType === "nth_order") payload.nthInterval = parseInt(nthInterval) || 0;

      const res = await fetch("/api/admin/reward-rules", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t("created"));
      setOpen(false); setAmount(""); setOrderThreshold(""); setLabel(""); setStartDate(""); setEndDate("");
      reload();
    } catch (e: any) {
      toast.error(e.message || t("createFailed"));
    } finally { setSaving(false); }
  };

  const toggle = async (r: Rule) => {
    setRules((prev) => prev.map((x) => x.id === r.id ? { ...x, active: !x.active } : x));
    try {
      const res = await fetch(`/api/admin/reward-rules/${r.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !r.active }),
      });
      if (!res.ok) throw new Error();
    } catch { toast.error(t("saveFailed")); reload(); }
  };

  const remove = async (r: Rule) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/admin/reward-rules/${r.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setRules((prev) => prev.filter((x) => x.id !== r.id));
    } catch { toast.error(t("deleteFailed")); }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600" />
          <h2 className="font-semibold text-gray-900">{t("title")}</h2>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600 hover:text-emerald-800">
            <Plus className="w-4 h-4" /> {t("add")}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">{t("subtitle", { label: rewardLabelPlural })}</p>

      {loading ? (
        <p className="mt-3 text-sm text-gray-400">{t("loading")}</p>
      ) : rules.length > 0 ? (
        <ul className="mt-3 divide-y divide-gray-100">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">{r.label || summary(r)}</div>
                {r.label && <div className="text-xs text-gray-500">{summary(r)}</div>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggle(r)} title={r.active ? t("pause") : t("resume")}>
                  {r.active ? <ToggleRight className="w-7 h-7 text-emerald-600" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                </button>
                <button onClick={() => remove(r)} className="p-1 text-gray-400 hover:text-red-600" title={t("delete")}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-400">{t("empty")}</p>
      )}

      {open && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-900">{t("newTitle")}</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{t("trigger")}</span>
              <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white">
                <option value="signup">{t("trigSignup")}</option>
                <option value="first_order">{t("trigFirstOrder")}</option>
                <option value="order_over">{t("trigOrderOver")}</option>
                <option value="nth_order">{t("trigNth")}</option>
              </select>
            </label>

            {triggerType === "order_over" && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t("threshold")}</span>
                <div className="mt-1 inline-flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
                  <span className="px-2 flex items-center bg-gray-50 text-gray-500 text-sm border-r border-gray-300">{currency.toUpperCase()}</span>
                  <input type="number" min={0} step="0.01" value={orderThreshold} onChange={(e) => setOrderThreshold(e.target.value)} placeholder="50.00" className="w-24 px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
                </div>
              </label>
            )}
            {triggerType === "nth_order" && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t("everyN")}</span>
                <input type="number" min={1} value={nthInterval} onChange={(e) => setNthInterval(e.target.value)} className="mt-1 w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{t("rewardKind")}</span>
              <select value={amountKind} onChange={(e) => setAmountKind(e.target.value as any)} disabled={!percentAllowed} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white disabled:bg-gray-100">
                <option value="flat">{t("kindFlat", { label: rewardLabelPlural })}</option>
                {percentAllowed && <option value="percent">{t("kindPercent")}</option>}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{amountKind === "flat" ? t("amount") : t("percent")}</span>
              <div className="mt-1 inline-flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
                {amountKind === "flat" && <span className="px-2 flex items-center bg-gray-50 text-gray-500 text-sm border-r border-gray-300">{currency.toUpperCase()}</span>}
                <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={amountKind === "flat" ? "5.00" : "10"} className="w-20 px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
                {amountKind === "percent" && <span className="px-2 flex items-center bg-gray-50 text-gray-500 text-sm border-l border-gray-300">%</span>}
              </div>
            </label>
          </div>

          {/* Optional campaign window */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{t("startDate")}</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{t("endDate")}</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
            </label>
            <label className="block flex-1 min-w-[10rem]">
              <span className="text-xs font-medium text-gray-600">{t("labelOptional")}</span>
              <input type="text" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("labelPlaceholder")} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
            </label>
          </div>

          <p className="text-[11px] text-gray-400">{t("windowHint")}</p>

          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700">{t("cancel")}</button>
            <button onClick={create} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
