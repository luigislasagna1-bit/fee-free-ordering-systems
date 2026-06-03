"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag, CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function AssignCouponForm({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  const t = useTranslations("admin.assignCoupon");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ code: string; discount: string } | null>(null);
  const [form, setForm] = useState({
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: "10",
    description: "",
    minimumOrder: "0",
    maxUses: "1",
    expiresAt: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}/assign-coupon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discountType: form.discountType,
          discountValue: Number(form.discountValue),
          description: form.description || undefined,
          minimumOrder: Number(form.minimumOrder),
          maxUses: Number(form.maxUses),
          expiresAt: form.expiresAt || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("errorFailed"));
        return;
      }
      const c = data.coupon;
      const discountLabel = form.discountType === "percentage"
        ? t("discountLabelPercent", { value: form.discountValue })
        : t("discountLabelFixed", { value: form.discountValue });
      setSuccess({ code: c.code, discount: discountLabel });
      // Reset form
      setForm({ ...form, description: "", discountValue: "10" });
      // Refresh the page-server-side to pull the new coupon into the
      // list below the form.
      router.refresh();
    } catch {
      setError(t("errorNetwork"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelDiscountType")}</label>
          <select
            value={form.discountType}
            onChange={(e) => setForm({ ...form, discountType: e.target.value as "percentage" | "fixed" })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="percentage">{t("optionPercentage")}</option>
            <option value="fixed">{t("optionFixed")}</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            {form.discountType === "percentage" ? t("labelPercent") : t("labelAmount")}
          </label>
          <input
            type="number"
            min={1}
            max={form.discountType === "percentage" ? 100 : undefined}
            step={form.discountType === "percentage" ? 1 : 0.01}
            required
            value={form.discountValue}
            onChange={(e) => setForm({ ...form, discountValue: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1">
          {t("labelDescription")}
        </label>
        <input
          type="text"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={t("placeholderDescription", { customerName: customerName ?? "" })}
          maxLength={200}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <p className="text-[11px] text-gray-500 mt-1">
          {t("hintDescription")}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelMinOrder")}</label>
          <input
            type="number"
            min={0}
            step={0.01}
            value={form.minimumOrder}
            onChange={(e) => setForm({ ...form, minimumOrder: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelMaxUses")}</label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.maxUses}
            onChange={(e) => setForm({ ...form, maxUses: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">{t("labelExpires")}</label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
          {t.rich("successMessage", {
            code: success.code ?? "",
            discount: success.discount ?? "",
            customerName: customerName ?? "",
            couponCode: (chunks) => <code className="font-mono font-bold">{chunks}</code>,
          })}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-lg text-sm transition"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Tag className="w-4 h-4" />}
        {t("buttonCreate")}
      </button>
    </form>
  );
}
