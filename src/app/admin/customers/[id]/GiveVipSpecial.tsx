"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Crown, Plus, Trash2, Tag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ScheduleEditor } from "../../customer-groups/ScheduleEditor";

type Promo = { id: string; name: string; isActive: boolean; promotionType: string; ruleConfig: any };
type Special = { id: string; promotionId: string; promoName: string; promotionType: string; isActive: boolean; ruleConfig: any };
type ViaGroup = { id: string; groupName: string; promoName: string; promotionType: string; isActive: boolean; ruleConfig: any };

/** Give a member-only VIP special (an existing promotion) to ONE customer — it
 *  auto-applies for them at checkout, no code. Lives on the customer profile;
 *  mirrors the VIP Specials page individual flow. Luigi 2026-06-27. */
export function GiveVipSpecial({ customerId, customerName, currency, rewardsEnabled = false, rewardLabelPlural = "Reward Dollars" }: { customerId: string; customerName: string; currency: string; rewardsEnabled?: boolean; rewardLabelPlural?: string }) {
  const t = useTranslations("admin.customerGroups");
  const [promos, setPromos] = useState<Promo[]>([]);
  const [specials, setSpecials] = useState<Special[]>([]);
  const [viaGroups, setViaGroups] = useState<ViaGroup[]>([]);
  const [pick, setPick] = useState("");
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/vip-specials/individuals?customerId=${encodeURIComponent(customerId)}`).then((x) => x.json());
      if (Array.isArray(r.targets)) setSpecials(r.targets);
      if (Array.isArray(r.viaGroups)) setViaGroups(r.viaGroups);
    } catch { /* ignore */ }
  }, [customerId]);

  useEffect(() => {
    fetch("/api/admin/vip-specials/pickable").then((x) => x.json()).then((d) => { if (Array.isArray(d.promotions)) setPromos(d.promotions); }).catch(() => {});
    reload();
  }, [reload]);

  async function give() {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/vip-specials/individuals", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promotionId: pick, customerIds: [customerId], notify }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || t("attachFailed")); return; }
      toast.success(t("given", { count: data.added }));
      if (notify && typeof data.emailed === "number") toast.success(t("notifySent", { count: data.emailed }));
      setPick("");
      await reload();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/vip-specials/individuals?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) { toast.error(t("detachFailed")); return; }
    setSpecials((s) => s.filter((x) => x.id !== id));
  }

  function chip(p: { ruleConfig: any }): string | null {
    const rc = p.ruleConfig || {};
    if (typeof rc.discountPercent === "number" && rc.discountPercent > 0) return `${rc.discountPercent}%`;
    if (typeof rc.discountAmount === "number" && rc.discountAmount > 0) return formatCurrency(rc.discountAmount, currency);
    return null;
  }

  const inputCls = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none";

  return (
    <>
    <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
        <Crown className="w-5 h-5 text-amber-500" />
        {t("giveVipSpecialHeading")}
      </h2>
      <p className="text-sm text-gray-500 mt-1">{t("giveVipSpecialSubtitle", { name: customerName })}</p>

      {/* Specials they get via a VIP GROUP — read-only here (managed on the group). */}
      {viaGroups.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {viaGroups.map((v) => {
            const c = chip(v);
            return (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl border border-gray-100 bg-gray-50/50">
                <span className="min-w-0 flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{v.promoName}</span>
                  {c && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">{c}</span>}
                  {!v.isActive && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">{t("inactiveBadge")}</span>}
                  <span className="text-[11px] text-gray-400">{t("vipViaGroup", { group: v.groupName })}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {/* Specials given to this person directly (removable). */}
      {specials.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {specials.map((s) => {
            const c = chip(s);
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 py-2 px-3 rounded-xl border border-gray-100 bg-gray-50/50">
                <span className="min-w-0 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-gray-800 truncate">{s.promoName}</span>
                  {c && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">{c}</span>}
                  {!s.isActive && <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-500">{t("inactiveBadge")}</span>}
                </span>
                <button onClick={() => remove(s.id)} title={t("removeTarget")} className="p-1 text-gray-400 hover:text-red-500 rounded flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </li>
            );
          })}
        </ul>
      )}

      {promos.length > 0 ? (
        <div className="mt-4">
          <div className="flex gap-2">
            <select className={inputCls + " flex-1"} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{t("attachPlaceholder")}</option>
              {promos.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{!p.isActive ? ` · ${t("inactiveBadge")}` : ""}</option>
              ))}
            </select>
            <button onClick={give} disabled={busy || !pick} className="inline-flex items-center gap-1.5 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl text-sm hover:bg-emerald-600 transition disabled:opacity-50">
              <Plus className="w-4 h-4" /> {busy ? "…" : t("giveSpecial")}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 mt-2">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
            {t("notifyPeople")}
          </label>
        </div>
      ) : (
        <p className="text-sm text-gray-400 mt-4">{t("noPickable")}</p>
      )}
    </div>
    {/* Recurring / scheduled auto-send for this individual. */}
    <ScheduleEditor target={{ customerId }} rewardsEnabled={rewardsEnabled} currency={currency} rewardLabelPlural={rewardLabelPlural} />
    </>
  );
}
