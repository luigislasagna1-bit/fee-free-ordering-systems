"use client";
import { useEffect, useState, useCallback } from "react";
import { CalendarClock, Plus, Trash2, ToggleLeft, ToggleRight, Loader2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { formatCurrency as fmtCurrency } from "@/lib/utils";

export type ScheduleTarget = { groupId?: string; customerId?: string; email?: string };

type Schedule = {
  id: string; kind: string; promotionId: string | null; amount: number | null; note: string | null;
  cadence: string; dayOfWeek: number | null; dayOfMonth: number | null; sendHour: string; startDate: string;
  active: boolean; nextRunAt: string | null; lastRunAt: string | null; runCount: number;
  promotion: { name: string } | null;
};
type Pickable = { id: string; name: string };

/**
 * Recurring / scheduled auto-send editor (Program 2). Drop Reward Dollars on a
 * cadence, or re-send a member-only special. Reused on the group page, the VIP
 * individuals section, and a customer's profile. Restaurant-scoped APIs.
 * Luigi 2026-06-27.
 */
export function ScheduleEditor({
  target, rewardsEnabled, currency, rewardLabelPlural,
}: {
  target: ScheduleTarget;
  rewardsEnabled: boolean;
  currency: string;
  rewardLabelPlural: string;
}) {
  const t = useTranslations("admin.customerGroups.schedules");
  const fmt = (n: number) => fmtCurrency(n, currency);

  const qs = target.groupId ? `groupId=${target.groupId}`
    : target.customerId ? `customerId=${target.customerId}`
    : `email=${encodeURIComponent(target.email ?? "")}`;

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pickable, setPickable] = useState<Pickable[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<"credit_grant" | "discount_resend">(rewardsEnabled ? "credit_grant" : "discount_resend");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [promotionId, setPromotionId] = useState("");
  const [cadence, setCadence] = useState("monthly");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [sendHour, setSendHour] = useState("09:00");
  const [startDate, setStartDate] = useState(today);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/vip-schedules?${qs}`);
      const data = await res.json();
      setSchedules(Array.isArray(data.schedules) ? data.schedules : []);
    } catch { /* keep last */ } finally { setLoading(false); }
  }, [qs]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    fetch("/api/admin/vip-specials/pickable").then((r) => r.json()).then((d) => setPickable(d.promotions ?? [])).catch(() => {});
  }, []);

  const dows = [t("sun"), t("mon"), t("tue"), t("wed"), t("thu"), t("fri"), t("sat")];

  const cadenceSummary = (s: Schedule) => {
    if (s.cadence === "once") return t("onceOn", { date: s.startDate, time: s.sendHour });
    if (s.cadence === "daily") return t("dailyAt", { time: s.sendHour });
    if (s.cadence === "weekly") return t("weeklyOn", { day: dows[s.dayOfWeek ?? 0], time: s.sendHour });
    return t("monthlyOn", { day: s.dayOfMonth ?? 1, time: s.sendHour });
  };

  const create = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/vip-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target, kind, cadence, sendHour, startDate,
          ...(cadence === "weekly" ? { dayOfWeek } : {}),
          ...(cadence === "monthly" ? { dayOfMonth } : {}),
          ...(kind === "credit_grant" ? { amount: parseFloat(amount) || 0, note: note || undefined } : { promotionId }),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t("created"));
      setOpen(false); setAmount(""); setNote(""); setPromotionId("");
      reload();
    } catch (e: any) {
      toast.error(e.message || t("createFailed"));
    } finally { setSaving(false); }
  };

  const toggle = async (s: Schedule) => {
    setSchedules((prev) => prev.map((x) => x.id === s.id ? { ...x, active: !x.active } : x));
    try {
      const res = await fetch(`/api/admin/vip-schedules/${s.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !s.active }),
      });
      if (!res.ok) throw new Error();
      reload();
    } catch { toast.error(t("saveFailed")); reload(); }
  };

  const remove = async (s: Schedule) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`/api/admin/vip-schedules/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSchedules((prev) => prev.filter((x) => x.id !== s.id));
    } catch { toast.error(t("deleteFailed")); }
  };

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-indigo-500" />
          <span className="font-semibold text-gray-900">{t("title")}</span>
        </div>
        {!open && (
          <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800">
            <Plus className="w-4 h-4" /> {t("add")}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500">{t("subtitle")}</p>

      {/* Existing schedules */}
      {loading ? (
        <p className="mt-3 text-sm text-gray-400">{t("loading")}</p>
      ) : schedules.length > 0 ? (
        <ul className="mt-3 divide-y divide-gray-100">
          {schedules.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-900">
                  {s.kind === "credit_grant"
                    ? t("creditLine", { amount: fmt(s.amount ?? 0), label: rewardLabelPlural })
                    : t("resendLine", { name: s.promotion?.name ?? "—" })}
                </div>
                <div className="text-xs text-gray-500">
                  {cadenceSummary(s)}
                  {s.active && s.nextRunAt ? <> · {t("next", { date: new Date(s.nextRunAt).toLocaleDateString() })}</> : null}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggle(s)} title={s.active ? t("pause") : t("resume")}>
                  {s.active ? <ToggleRight className="w-7 h-7 text-emerald-600" /> : <ToggleLeft className="w-7 h-7 text-gray-300" />}
                </button>
                <button onClick={() => remove(s)} className="p-1 text-gray-400 hover:text-red-600" title={t("delete")}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-gray-400">{t("empty")}</p>
      )}

      {/* Create form */}
      {open && (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-indigo-900">{t("newTitle")}</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>

          {/* Kind */}
          <div className="flex flex-wrap gap-2">
            {rewardsEnabled && (
              <button onClick={() => setKind("credit_grant")}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium border ${kind === "credit_grant" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}>
                {t("kindCredit")}
              </button>
            )}
            <button onClick={() => setKind("discount_resend")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium border ${kind === "discount_resend" ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-700 border-gray-300"}`}>
              {t("kindResend")}
            </button>
          </div>

          {/* Kind-specific */}
          {kind === "credit_grant" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t("amount", { label: rewardLabelPlural })}</span>
                <div className="mt-1 inline-flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
                  <span className="px-2 flex items-center bg-gray-50 text-gray-500 text-sm border-r border-gray-300">{currency.toUpperCase()}</span>
                  <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="w-24 px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
                </div>
              </label>
              <label className="block flex-1 min-w-[10rem]">
                <span className="text-xs font-medium text-gray-600">{t("noteLabel")}</span>
                <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("notePlaceholder")} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:outline-none" />
              </label>
            </div>
          ) : (
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{t("promotion")}</span>
              <select value={promotionId} onChange={(e) => setPromotionId(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white">
                <option value="">{t("pickPromotion")}</option>
                {pickable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}

          {/* Cadence + timing */}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{t("cadence")}</span>
              <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white">
                <option value="once">{t("once")}</option>
                <option value="daily">{t("daily")}</option>
                <option value="weekly">{t("weekly")}</option>
                <option value="monthly">{t("monthly")}</option>
              </select>
            </label>
            {cadence === "weekly" && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t("onDay")}</span>
                <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 bg-white">
                  {dows.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </label>
            )}
            {cadence === "monthly" && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t("dayOfMonth")}</span>
                <input type="number" min={1} max={31} value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className="mt-1 w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
              </label>
            )}
            {cadence === "once" && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t("onDate")}</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
              </label>
            )}
            <label className="block">
              <span className="text-xs font-medium text-gray-600">{t("atTime")}</span>
              <input type="time" value={sendHour} onChange={(e) => setSendHour(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
            </label>
            {cadence !== "once" && (
              <label className="block">
                <span className="text-xs font-medium text-gray-600">{t("startingFrom")}</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700">{t("cancel")}</button>
            <button onClick={create} disabled={saving} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} {t("save")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
