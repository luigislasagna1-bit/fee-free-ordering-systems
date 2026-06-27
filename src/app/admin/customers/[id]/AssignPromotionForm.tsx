"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Assign a PROMOTION to one customer (replaces the retired "assign coupon").
 * Posts to /api/admin/promotions/assign-to-customer, which creates a hidden,
 * code-required, once-per-lifetime promotion + a grant keyed to the customer.
 * Adds Fabrizio's asks: per-service restriction + stacking choice. The email
 * always sends (1:1 gift). Luigi 2026-06-26.
 */
export function AssignPromotionForm({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const t = useTranslations("admin.assignCoupon");
  const tr = useTranslations("admin.promoStepRestrictions");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; discount: string; emailed: boolean } | null>(null);
  const [form, setForm] = useState({
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: "10",
    description: "",
    minimumOrder: "0",
    expiresAt: "",
    orderType: "both",
    stackingRule: "standard",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/promotions/assign-to-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          description: form.description || undefined,
          minimumOrder: Number(form.minimumOrder),
          expiresAt: form.expiresAt || undefined,
          orderType: form.orderType,
          stackingRule: form.stackingRule,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("errorFailed"));
        return;
      }
      const discountLabel = form.discountType === "percentage"
        ? t("discountLabelPercent", { value: form.discountValue })
        : t("discountLabelFixed", { value: form.discountValue });
      setSuccess({ code: data.code, discount: discountLabel, emailed: data.emailed === true });
      setForm({ ...form, description: "", discountValue: "10" });
      router.refresh();
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelDiscountType")}</label>
          <select value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })} className={inputCls}>
            <option value="percentage">{t("optionPercentage")}</option>
            <option value="fixed">{t("optionFixed")}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {form.discountType === "percentage" ? t("labelPercent") : t("labelAmount")}
          </label>
          <input type="number" min={1} max={form.discountType === "percentage" ? 100 : undefined} step={form.discountType === "percentage" ? 1 : 0.01} required value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelDescription")}</label>
        <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("placeholderDescription", { customerName: customerName ?? "" })} maxLength={200} className={inputCls} />
        <p className="text-[11px] text-gray-500 mt-1">{t("hintDescription")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelMinOrder")}</label>
          <input type="number" min={0} step={0.01} value={form.minimumOrder} onChange={(e) => setForm({ ...form, minimumOrder: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelExpires")}</label>
          <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelOrderType")}</label>
          <select value={form.orderType} onChange={(e) => setForm({ ...form, orderType: e.target.value })} className={inputCls}>
            <option value="both">{tr("channelBothLabel")}</option>
            <option value="pickup">{tr("channelPickup")}</option>
            <option value="delivery">{tr("channelDelivery")}</option>
            <option value="dine_in">{tr("channelDineIn")}</option>
            <option value="take_out">{tr("channelTakeout")}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelStacking")}</label>
          <select value={form.stackingRule} onChange={(e) => setForm({ ...form, stackingRule: e.target.value })} className={inputCls}>
            <option value="standard">{tr("stackingStandardLabel")}</option>
            <option value="exclusive">{tr("stackingExclusiveLabel")}</option>
            <option value="master">{tr("stackingMasterLabel")}</option>
          </select>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
          {t.rich("successMessage", {
            code: success.code ?? "",
            discount: success.discount ?? "",
            customerName: customerName ?? "",
            couponCode: (chunks) => <code className="font-mono font-bold">{chunks}</code>,
          })}
          <div className="mt-1 text-[11px] text-emerald-700">{success.emailed ? t("emailSent") : t("emailSkipped")}</div>
        </div>
      )}

      <button type="submit" disabled={busy} className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
        {t("buttonCreate")}
      </button>
    </form>
  );
}
