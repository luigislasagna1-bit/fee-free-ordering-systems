"use client";
import { useEffect, useState } from "react";
import { Plus, Wallet, Trash2, Pencil, Loader2, X, ToggleLeft, ToggleRight, Receipt } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@/lib/utils";

interface ServiceFee {
  id: string;
  name: string;
  feeType: "fixed" | "percent";
  amount: number;
  appliesTo: "pickup" | "delivery" | "both";
  daysOfWeek: string | null;
  publicHolidaysOnly: boolean;
  countryCode: string;
  isActive: boolean;
  sortOrder: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function emptyForm(): Omit<ServiceFee, "id" | "sortOrder"> {
  return {
    name: "",
    feeType: "fixed",
    amount: 0,
    appliesTo: "both",
    daysOfWeek: null,
    publicHolidaysOnly: false,
    countryCode: "US",
    isActive: true,
  };
}

function describeDays(csv: string | null, everyDayLabel: string, shortDay: (i: number) => string) {
  if (!csv) return everyDayLabel;
  const days = csv.split(",").map((d) => shortDay(parseInt(d, 10))).filter(Boolean);
  return days.join(", ");
}

function formatAmount(fee: ServiceFee) {
  return fee.feeType === "percent" ? `${fee.amount}%` : `$${fee.amount.toFixed(2)}`;
}

export function ServiceFeesClient() {
  const t = useTranslations("admin.serviceFees");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");
  const tInfo = useTranslations("info");
  const [loading, setLoading] = useState(true);
  const [fees, setFees] = useState<ServiceFee[]>([]);
  const [editing, setEditing] = useState<ServiceFee | null>(null);
  const [form, setForm] = useState<Omit<ServiceFee, "id" | "sortOrder">>(emptyForm());
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  // Sales tax — used to live on /admin/profile alongside delivery-fee /
  // estimated times. Luigi 2026-05-30 audit: "the tax option from main
  // admin panel, can we completely move that and make it an option only
  // in the correct taxes section?" — moved here so tax + service fees
  // live together on the same page.
  const [taxRate, setTaxRate] = useState<string>("0");
  const [savingTax, setSavingTax] = useState(false);
  // Tips + currency live next to taxRate so the "money behaviour"
  // controls are in one section (Luigi 2026-05-31).
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [savingTips, setSavingTips] = useState(false);
  const [currency, setCurrency] = useState<string>("usd");
  const [savingCurrency, setSavingCurrency] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [feesRes, profileRes] = await Promise.all([
        fetch("/api/admin/service-fees"),
        fetch("/api/restaurants/profile"),
      ]);
      const d = await feesRes.json();
      setFees(d.fees || []);
      if (profileRes.ok) {
        const p = await profileRes.json();
        if (typeof p.taxRate === "number") setTaxRate(String(p.taxRate));
        if (typeof p.tipsEnabled === "boolean") setTipsEnabled(p.tipsEnabled);
        if (typeof p.currency === "string" && p.currency) setCurrency(p.currency);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveTaxRate = async () => {
    const parsed = parseFloat(taxRate);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Tax rate must be between 0 and 100");
      return;
    }
    setSavingTax(true);
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxRate: parsed }),
      });
      if (!res.ok) throw new Error();
      toast.success(tToasts("saved"));
    } catch {
      toast.error(tToasts("saveFailed"));
    } finally {
      setSavingTax(false);
    }
  };

  const saveTips = async (next: boolean) => {
    setTipsEnabled(next);
    setSavingTips(true);
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipsEnabled: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(tToasts("saved"));
    } catch {
      setTipsEnabled(!next);
      toast.error(tToasts("saveFailed"));
    } finally {
      setSavingTips(false);
    }
  };

  const saveCurrency = async (next: string) => {
    const prev = currency;
    setCurrency(next);
    setSavingCurrency(true);
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: next.toLowerCase() }),
      });
      if (!res.ok) throw new Error();
      toast.success(tToasts("saved"));
    } catch {
      setCurrency(prev);
      toast.error(tToasts("saveFailed"));
    } finally {
      setSavingCurrency(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowModal(true);
  };

  const openEdit = (fee: ServiceFee) => {
    setEditing(fee);
    setForm({
      name: fee.name,
      feeType: fee.feeType,
      amount: fee.amount,
      appliesTo: fee.appliesTo,
      daysOfWeek: fee.daysOfWeek,
      publicHolidaysOnly: fee.publicHolidaysOnly,
      countryCode: fee.countryCode,
      isActive: fee.isActive,
    });
    setShowModal(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(`${tCommon("name")} *`);
      return;
    }
    setSaving(true);
    try {
      const url = editing ? `/api/admin/service-fees/${editing.id}` : "/api/admin/service-fees";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(editing ? tToasts("updated") : tToasts("created"));
      setShowModal(false);
      load();
    } catch {
      toast.error(tToasts("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (fee: ServiceFee) => {
    if (!confirm(`Delete "${fee.name}"?`)) return;
    try {
      const res = await fetch(`/api/admin/service-fees/${fee.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(tToasts("deleted"));
      load();
    } catch {
      toast.error(tToasts("deleteFailed"));
    }
  };

  const toggleActive = async (fee: ServiceFee) => {
    try {
      const res = await fetch(`/api/admin/service-fees/${fee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !fee.isActive }),
      });
      if (!res.ok) throw new Error();
      load();
    } catch {
      toast.error(tToasts("updateFailed"));
    }
  };

  const toggleDay = (dayIndex: number) => {
    const current = form.daysOfWeek?.split(",").map((d) => parseInt(d, 10)) ?? [];
    const has = current.includes(dayIndex);
    const next = has ? current.filter((d) => d !== dayIndex) : [...current, dayIndex];
    next.sort((a, b) => a - b);
    setForm((f) => ({ ...f, daysOfWeek: next.length === 0 || next.length === 7 ? null : next.join(",") }));
  };

  const selectedDays = form.daysOfWeek?.split(",").map((d) => parseInt(d, 10)) ?? [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-emerald-600 transition text-sm shadow-sm"
        >
          <Plus className="w-4 h-4" /> {t("addFee")}
        </button>
      </div>

      {/* ── Sales Tax Rate ──────────────────────────────────────────
          Moved here from /admin/profile Ordering Settings. Single
          source of truth — Customer cart applies this rate to the
          taxable base (subtotal − promo discount + delivery + fees). */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Receipt className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900">Sales tax rate</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Applied to every order&apos;s taxable subtotal. Set to 0 if you
              don&apos;t collect sales tax. (e.g. 13 for 13% HST.)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rate (%)</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="w-32 border border-gray-300 rounded-lg pl-3 pr-8 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
              />
              <span className="absolute right-3 top-2.5 text-gray-400 text-sm pointer-events-none">%</span>
            </div>
          </div>
          <button
            onClick={saveTaxRate}
            disabled={savingTax}
            className="bg-emerald-500 text-white font-semibold px-5 py-2 rounded-lg hover:bg-emerald-600 transition text-sm shadow-sm disabled:opacity-50"
          >
            {savingTax ? "Saving…" : "Save tax rate"}
          </button>
        </div>
      </div>

      {/* ── Currency ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900">Currency</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Drives every price the customer sees plus Stripe/PayPal charges, receipts and reports. Changing currency does NOT
              convert existing prices — update menu prices to match if you switch from USD to EUR (etc.).
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Currency</label>
            <select
              value={currency.toUpperCase()}
              onChange={(e) => saveCurrency(e.target.value)}
              disabled={savingCurrency}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none min-w-[18rem]"
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code}>{c.symbol}  {c.code} — {c.label}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-500 pb-2">
            Sample: <strong>{(new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() })).format(12.34)}</strong>
          </p>
        </div>
      </div>

      {/* ── Tips ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <Receipt className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-gray-900">Customer tips</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                When OFF, the customer cart hides the tip selector entirely and the server clamps any tampered client value to 0.
                Some restaurants (e.g. in countries where tipping isn&apos;t customary) prefer no tip prompts.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => saveTips(!tipsEnabled)}
            disabled={savingTips}
            className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${tipsEnabled ? "bg-emerald-500" : "bg-gray-300"} disabled:opacity-60`}
            aria-label={tipsEnabled ? "Disable tips" : "Enable tips"}
          >
            <span className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-all ${tipsEnabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      {fees.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="font-semibold text-gray-900">{t("noFees")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("noFeesHelp")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">{t("feeName")}</th>
                <th className="text-left px-4 py-3">{t("amount")}</th>
                <th className="text-left px-4 py-3">{t("appliesTo")}</th>
                <th className="text-left px-4 py-3">{t("schedule")}</th>
                <th className="text-left px-4 py-3">{t("status")}</th>
                <th className="text-right px-4 py-3">{tCommon("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {fees.map((fee) => (
                <tr key={fee.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium text-gray-900">{fee.name}</td>
                  <td className="px-4 py-3 text-gray-700">{formatAmount(fee)}</td>
                  <td className="px-4 py-3 text-gray-700">{t(fee.appliesTo === "both" ? "both" : fee.appliesTo)}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {fee.publicHolidaysOnly
                      ? t("publicHolidaysLabel", { country: fee.countryCode })
                      : describeDays(fee.daysOfWeek, t("everyDay"), (i) => tInfo(`shortDays.${i}`))}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(fee)} className="text-gray-500 hover:text-emerald-500">
                      {fee.isActive
                        ? <ToggleRight className="w-7 h-7 text-emerald-500" />
                        : <ToggleLeft className="w-7 h-7" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(fee)} className="text-gray-500 hover:text-emerald-500 mr-3">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => remove(fee)} className="text-gray-500 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{editing ? t("editFee") : t("newFee")}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("feeName")}</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  placeholder={t("feeNamePlaceholder")}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("feeType")}</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.feeType}
                    onChange={(e) => setForm((f) => ({ ...f, feeType: e.target.value as "fixed" | "percent" }))}
                  >
                    <option value="fixed">{t("typeFixed")}</option>
                    <option value="percent">{t("typePercent")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t("amount")}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: Math.max(0, parseFloat(e.target.value) || 0) }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">{t("appliesTo")}</label>
                <div className="flex gap-2">
                  {(["pickup", "delivery", "both"] as const).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, appliesTo: scope }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm border transition ${
                        form.appliesTo === scope
                          ? "bg-emerald-500 text-white border-emerald-500"
                          : "bg-white text-gray-700 border-gray-300 hover:border-emerald-400"
                      }`}
                    >
                      {t(scope)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {t("daysOfWeek")} {form.publicHolidaysOnly && <span className="text-gray-400">{t("daysDisabled")}</span>}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {[0,1,2,3,4,5,6].map((idx) => {
                    const isSelected = selectedDays.includes(idx);
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={form.publicHolidaysOnly}
                        onClick={() => toggleDay(idx)}
                        className={`w-12 h-9 rounded-lg text-xs font-medium border transition ${
                          form.publicHolidaysOnly
                            ? "bg-gray-50 text-gray-300 border-gray-200 cursor-not-allowed"
                            : isSelected
                              ? "bg-emerald-500 text-white border-emerald-500"
                              : "bg-white text-gray-700 border-gray-300 hover:border-emerald-400"
                        }`}
                      >
                        {tInfo(`shortDays.${idx}`)}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-1">{t("daysHelp")}</p>
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-emerald-500"
                    checked={form.publicHolidaysOnly}
                    onChange={(e) => setForm((f) => ({ ...f, publicHolidaysOnly: e.target.checked }))}
                  />
                  <span className="text-sm text-gray-800">{t("publicHolidaysOnly")}</span>
                </label>
                {form.publicHolidaysOnly && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("country")}</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={form.countryCode}
                      onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                    >
                      <option value="US">{t("us")}</option>
                      <option value="CA">{t("ca")}</option>
                    </select>
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-emerald-500"
                  checked={form.isActive}
                  onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                />
                <span className="text-sm text-gray-800">{t("active")}</span>
              </label>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {tCommon("cancel")}
              </button>
              <button
                disabled={saving}
                onClick={save}
                className="px-4 py-2 rounded-lg text-sm bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editing ? tCommon("save") : tCommon("create")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
