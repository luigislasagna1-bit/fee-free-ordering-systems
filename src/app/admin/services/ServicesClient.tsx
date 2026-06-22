"use client";
import { useState, useEffect } from "react";
import {
  ShoppingBag, Truck, UtensilsCrossed, PartyPopper,
  Package, CalendarDays, Save, Loader2, ToggleLeft, ToggleRight,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

const SERVICE_DEFS = [
  { key: "pickup",       labelKey: "pickup",       icon: ShoppingBag,     color: "text-blue-600"   },
  { key: "delivery",     labelKey: "delivery",     icon: Truck,           color: "text-green-600"  },
  { key: "dineIn",       labelKey: "dineIn",       icon: UtensilsCrossed, color: "text-emerald-600" },
  { key: "catering",     labelKey: "catering",     icon: PartyPopper,     color: "text-amber-600" },
  { key: "takeOut",      labelKey: "takeOut",      icon: Package,         color: "text-yellow-600" },
  { key: "reservations", labelKey: "reservations", icon: CalendarDays,    color: "text-red-600"    },
] as const;

type ServiceKey = "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";

// Pre-order min-lead helpers: store minutes, edit as value + unit.
function splitLead(mins: number): { v: number; u: "min" | "hour" | "day" } {
  if (mins <= 0) return { v: 0, u: "min" };
  if (mins % 1440 === 0) return { v: mins / 1440, u: "day" };
  if (mins % 60 === 0) return { v: mins / 60, u: "hour" };
  return { v: mins, u: "min" };
}
function joinLead(v: number, u: "min" | "hour" | "day"): number {
  const mult = u === "day" ? 1440 : u === "hour" ? 60 : 1;
  return Math.max(0, Math.floor(v || 0)) * mult;
}

interface ServiceConfig {
  displayName: string;
  description: string;
  estimatedTime: number;
  /** Per-service scheduling slot cadence in minutes. 0/undefined = fall back
   *  to the restaurant-wide default (Restaurant.scheduledOrderInterval). Lets
   *  e.g. delivery use 30-min slots while pickup uses 15. Luigi 2026-06-04. */
  slotInterval?: number;
  /** How the customer picks a scheduled time for this service:
   *   - "bands"  (default): a dropdown of fixed slots at slotInterval.
   *   - "exact": a free time field so the customer can pick any minute
   *     within opening hours.
   *   - "both": the customer toggles between a slot dropdown and an exact
   *     time field. Fabrizio cmpxdtl9m (2026-06-07). */
  slotMode?: "bands" | "exact" | "both";
}

export function ServicesClient() {
  const t = useTranslations("admin.services");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<Record<ServiceKey, boolean>>({
    pickup: true, delivery: false, dineIn: false, catering: false, takeOut: false, reservations: false,
  });
  // Catering notice — minimum advance hours customers must schedule a
  // catering-tagged order. 24h default matches industry convention.
  // The catering card exposes presets (24 / 48 / 72) + a custom input
  // for restaurants that want something else (e.g. a 12h shop or a 5d
  // banquet hall).
  const [cateringNoticeHours, setCateringNoticeHours] = useState<number>(24);
  // Pre-order ("order for later") advance limits per service. Min lead stored
  // in minutes; max advance in days (0 = no limit). Fabrizio cmq14gy64.
  const [preorder, setPreorder] = useState({
    pickupMinLeadMinutes: 0, pickupMaxAdvanceDays: 0,
    deliveryMinLeadMinutes: 0, deliveryMaxAdvanceDays: 0,
    dineInMinLeadMinutes: 0, dineInMaxAdvanceDays: 0,
    allowScheduledOrders: true, requireScheduledOrders: false,
  });
  const [settings, setSettings] = useState<Record<ServiceKey, ServiceConfig>>({
    pickup:       { displayName: "Pickup",             description: "", estimatedTime: 20 },
    delivery:     { displayName: "Delivery",           description: "", estimatedTime: 45 },
    dineIn:       { displayName: "Dine-In",            description: "", estimatedTime: 15 },
    catering:     { displayName: "Catering",           description: "", estimatedTime: 60 },
    takeOut:      { displayName: "Take Out",           description: "", estimatedTime: 20 },
    reservations: { displayName: "Table Reservations", description: "", estimatedTime: 0 },
  });

  useEffect(() => {
    fetch("/api/admin/services").then(r => r.json()).then(d => {
      if (d.enabled) setEnabled(e => ({ ...e, ...d.enabled }));
      if (d.settings) setSettings(s => ({ ...s, ...d.settings }));
      if (typeof d.cateringNoticeHours === "number" && d.cateringNoticeHours > 0) {
        setCateringNoticeHours(d.cateringNoticeHours);
      }
      if (d.preorder) setPreorder(p => ({ ...p, ...d.preorder }));
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      // autoAcceptOrders + the scheduled-orders master toggles now live on
      // /admin/order-handling (Taking Orders). The Services page no longer edits or
      // saves them — send only the per-service pre-order lead times so a service save
      // can never clobber the Order Handling settings. Luigi 2026-06-22.
      const { pickupMinLeadMinutes, pickupMaxAdvanceDays, deliveryMinLeadMinutes, deliveryMaxAdvanceDays, dineInMinLeadMinutes, dineInMaxAdvanceDays } = preorder;
      const res = await fetch("/api/admin/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled, settings, cateringNoticeHours,
          preorder: { pickupMinLeadMinutes, pickupMaxAdvanceDays, deliveryMinLeadMinutes, deliveryMaxAdvanceDays, dineInMinLeadMinutes, dineInMaxAdvanceDays },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(tToasts("saved"));
    } catch {
      toast.error(tToasts("saveFailed"));
    }
    setSaving(false);
  };

  const updateSetting = (key: ServiceKey, field: keyof ServiceConfig, value: string | number) => {
    setSettings(s => ({ ...s, [key]: { ...s[key], [field]: value } }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-emerald-600 transition text-sm shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {tCommon("saveChanges")}
        </button>
      </div>

      <div className="space-y-4">
        {SERVICE_DEFS.map(({ key, labelKey, icon: Icon, color }) => {
          const label = t(labelKey);
          const desc = "";
          const on = enabled[key];
          return (
            <div
              key={key}
              className={`bg-white rounded-2xl border shadow-sm transition ${on ? "border-emerald-200" : "border-gray-100"}`}
            >
              {/* Header row */}
              <div className="flex items-center gap-4 p-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${on ? "bg-emerald-50" : "bg-gray-50"}`}>
                  <Icon className={`w-5 h-5 ${on ? color : "text-gray-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{label}</h3>
                    {on && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{t("enabled")}</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => setEnabled(e => ({ ...e, [key]: !e[key] }))}
                  className="flex-shrink-0 text-gray-400 hover:text-emerald-500 transition"
                  title={on ? t("disable") : t("enable")}
                >
                  {on
                    ? <ToggleRight className="w-8 h-8 text-emerald-500" />
                    : <ToggleLeft className="w-8 h-8" />
                  }
                </button>
              </div>

              {/* Expanded settings when enabled */}
              {on && (
                <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("displayName")}</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      value={settings[key].displayName}
                      onChange={e => updateSetting(key, "displayName", e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">{t("shortDescription")}</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder={t("shortDescriptionPlaceholder")}
                      value={settings[key].description}
                      onChange={e => updateSetting(key, "description", e.target.value)}
                    />
                  </div>
                  {key !== "reservations" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t("estimatedTime")}</label>
                      <input
                        type="number" min="0" step="5"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        value={settings[key].estimatedTime}
                        onChange={e => updateSetting(key, "estimatedTime", parseInt(e.target.value) || 0)}
                      />
                    </div>
                  )}
                  {/* Per-service time-selection mode. "Time slots" gives the
                      customer a dropdown of fixed slots at the chosen cadence;
                      "Exact time" lets them pick any minute within opening
                      hours. Fabrizio cmpxdtl9m. */}
                  {key !== "reservations" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t("timeSelectionLabel")}</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                        value={settings[key].slotMode ?? "bands"}
                        onChange={e => updateSetting(key, "slotMode", e.target.value)}
                      >
                        <option value="bands">{t("timeSelectionBands")}</option>
                        <option value="exact">{t("timeSelectionExact")}</option>
                        <option value="both">{t("timeSelectionBoth")}</option>
                      </select>
                    </div>
                  )}
                  {/* Per-service scheduling cadence. "Default" leaves it on the
                      restaurant-wide slot interval; a specific value overrides
                      it for THIS service only (e.g. slower kitchens on delivery).
                      Hidden in "Exact time" mode, where the interval is moot. */}
                  {key !== "reservations" && (settings[key].slotMode ?? "bands") !== "exact" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t("slotInterval")}</label>
                      <select
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white"
                        value={settings[key].slotInterval ?? 0}
                        onChange={e => updateSetting(key, "slotInterval", parseInt(e.target.value) || 0)}
                      >
                        <option value={0}>{t("slotIntervalDefault")}</option>
                        {[10, 15, 20, 30, 45, 60].map(m => (
                          <option key={m} value={m}>{t("slotIntervalMin", { min: m })}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {key === "reservations" && (
                    <div className="sm:col-span-3">
                      <p className="text-xs text-gray-400">
                        {t.rich("configureReservationsLink", {
                          link: (chunks) => (
                            <a href="/admin/reservations" className="text-emerald-500 hover:underline font-medium">{chunks}</a>
                          ),
                        })}
                      </p>
                    </div>
                  )}
                  {/* Catering-specific: advance-notice window. ASAP orders
                      with catering items are blocked; the customer's
                      schedule picker shows now + N as the earliest slot.
                      Items / categories are tagged "catering" individually
                      in /admin/menu (catering toggle on the item drawer +
                      the category modal). */}
                  {(key === "pickup" || key === "delivery" || key === "dineIn") && preorder.allowScheduledOrders && (() => {
                    const minKey = key === "pickup" ? "pickupMinLeadMinutes" : key === "delivery" ? "deliveryMinLeadMinutes" : "dineInMinLeadMinutes";
                    const maxKey = key === "pickup" ? "pickupMaxAdvanceDays" : key === "delivery" ? "deliveryMaxAdvanceDays" : "dineInMaxAdvanceDays";
                    const lead = splitLead(preorder[minKey]);
                    const maxDays = preorder[maxKey];
                    return (
                      <div className="sm:col-span-3 pt-2 border-t border-gray-100 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t("minAdvanceLabel")}</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min={0} step={1}
                              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                              value={lead.v}
                              onChange={(e) => setPreorder(p => ({ ...p, [minKey]: joinLead(parseInt(e.target.value, 10) || 0, lead.u) }))}
                            />
                            <select
                              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                              value={lead.u}
                              onChange={(e) => setPreorder(p => ({ ...p, [minKey]: joinLead(lead.v, e.target.value as "min" | "hour" | "day") }))}
                            >
                              <option value="min">{t("unitMinutes")}</option>
                              <option value="hour">{t("unitHours")}</option>
                              <option value="day">{t("unitDays")}</option>
                            </select>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">{t("minAdvanceHint")}</p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t("maxAdvanceLabel")}</label>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min={0} max={365} step={1}
                              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                              value={maxDays}
                              onChange={(e) => { const v = parseInt(e.target.value, 10); setPreorder(p => ({ ...p, [maxKey]: Number.isNaN(v) ? 0 : Math.max(0, Math.min(365, v)) })); }}
                            />
                            <span className="text-xs text-gray-500">{t("unitDays")}</span>
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">{maxDays > 0 ? t("maxAdvanceHint", { days: maxDays }) : t("maxAdvanceHintUnlimited")}</p>
                        </div>
                      </div>
                    );
                  })()}
                  {key === "catering" && (
                    <div className="sm:col-span-3 pt-2 border-t border-gray-100">
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        {t("cateringNoticeLabel")}
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[24, 48, 72].map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => setCateringNoticeHours(h)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                              cateringNoticeHours === h
                                ? "bg-emerald-500 text-white border-emerald-500"
                                : "bg-white text-gray-700 border-gray-300 hover:border-emerald-300"
                            }`}
                          >
                            {h === 24 ? t("cateringNotice24h") : h === 48 ? t("cateringNotice48h") : t("cateringNotice72h")}
                          </button>
                        ))}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            max={720}
                            step={1}
                            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                            value={cateringNoticeHours}
                            onChange={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (!Number.isNaN(v) && v > 0 && v <= 720) setCateringNoticeHours(v);
                            }}
                          />
                          <span className="text-xs text-gray-500">{t("unitHours")}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                        {t.rich("cateringNoticeHelp", {
                          hours: cateringNoticeHours,
                          link: (chunks) => (
                            <a href="/admin/menu" className="text-emerald-600 hover:underline font-medium">{chunks}</a>
                          ),
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
