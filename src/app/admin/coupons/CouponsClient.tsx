"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, Tag, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useCurrencyFormat } from "@/lib/currency-context";
import { useTranslations } from "next-intl";

const emptyForm = { code: "", description: "", discountType: "percentage", discountValue: "", minimumOrder: "0", maxUses: "", expiresAt: "" };

export function CouponsClient({ coupons: initial }: { coupons: any[] }) {
  const formatCurrency = useCurrencyFormat();
  const t = useTranslations("admin.couponsAdmin");
  const [coupons, setCoupons] = useState(initial);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  const reload = async () => {
    const res = await fetch("/api/restaurants/coupons");
    if (res.ok) setCoupons(await res.json());
  };

  const save = async () => {
    if (!form.code || !form.discountValue) { toast.error(t("codeAndValueRequired")); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/restaurants/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          discountValue: parseFloat(form.discountValue),
          minimumOrder: parseFloat(form.minimumOrder) || 0,
          maxUses: form.maxUses ? parseInt(form.maxUses) : null,
          expiresAt: form.expiresAt || null,
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || t("saveFailed")); }
      toast.success(t("couponCreated"));
      setForm(emptyForm); setShowForm(false);
      await reload();
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  const toggle = async (id: string, isActive: boolean) => {
    await fetch(`/api/restaurants/coupons/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    await reload();
  };

  const del = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/restaurants/coupons/${id}`, { method: "DELETE" });
    await reload();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition text-sm"
        >
          <Plus className="w-4 h-4" /> {t("createCouponButton")}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-emerald-200 p-5 mb-5">
          <h2 className="font-semibold text-gray-900 mb-4">{t("newCouponHeading")}</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t("labelCouponCode")}</label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase" placeholder={t("placeholderCouponCode")} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t("labelDiscountType")}</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
                <option value="percentage">{t("optionPercentage")}</option>
                <option value="fixed">{t("optionFixed")}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t("labelDiscountValue")}</label>
              <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder={form.discountType === "percentage" ? "10" : "5.00"} value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t("labelMinOrder")}</label>
              <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="0" value={form.minimumOrder} onChange={(e) => setForm({ ...form, minimumOrder: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t("labelMaxUses")}</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder={t("placeholderUnlimited")} value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">{t("labelExpiresAt")}</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="text-sm font-medium text-gray-700 block mb-1">{t("labelDescription")}</label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder={t("placeholderDescription")} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={save} disabled={loading} className="bg-emerald-500 text-white text-sm px-5 py-2 rounded-lg hover:bg-emerald-600 transition font-medium">
              {loading ? t("saving") : t("createCouponButton")}
            </button>
            <button onClick={() => setShowForm(false)} className="text-gray-500 text-sm px-3 py-2 hover:text-gray-700">{t("cancel")}</button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {coupons.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>{t("emptyCoupons")}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {coupons.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className={`px-3 py-1 rounded-lg font-mono font-bold text-sm ${c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                    {c.code}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {c.discountType === "percentage" ? t("percentageOff", { value: c.discountValue }) : formatCurrency(c.discountValue)}
                      {c.minimumOrder > 0 && ` ${t("minOrderDisplay", { amount: formatCurrency(c.minimumOrder) })}`}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t("usedCount", { used: c.usedCount, max: c.maxUses ?? "∞" })}
                      {c.expiresAt && ` · ${t("expiresOn", { date: formatDate(c.expiresAt) })}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(c.id, !c.isActive)} className="text-gray-400 hover:text-emerald-500 transition">
                    {c.isActive ? <ToggleRight className="w-6 h-6 text-emerald-500" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button onClick={() => del(c.id)} className="text-gray-400 hover:text-red-500 transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
