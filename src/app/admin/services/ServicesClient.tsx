"use client";
import { useState, useEffect } from "react";
import {
  ShoppingBag, Truck, UtensilsCrossed, PartyPopper,
  Package, CalendarDays, Save, Loader2, ToggleLeft, ToggleRight, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

const SERVICE_DEFS = [
  { key: "pickup",       labelKey: "pickup",       icon: ShoppingBag,     color: "text-blue-600"   },
  { key: "delivery",     labelKey: "delivery",     icon: Truck,           color: "text-green-600"  },
  { key: "dineIn",       labelKey: "dineIn",       icon: UtensilsCrossed, color: "text-emerald-600" },
  { key: "catering",     labelKey: "catering",     icon: PartyPopper,     color: "text-purple-600" },
  { key: "takeOut",      labelKey: "takeOut",      icon: Package,         color: "text-yellow-600" },
  { key: "reservations", labelKey: "reservations", icon: CalendarDays,    color: "text-red-600"    },
] as const;

type ServiceKey = "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";

interface ServiceConfig {
  displayName: string;
  description: string;
  estimatedTime: number;
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
  const [autoAcceptOrders, setAutoAcceptOrders] = useState(false);
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
      if (typeof d.autoAcceptOrders === "boolean") setAutoAcceptOrders(d.autoAcceptOrders);
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, settings, autoAcceptOrders }),
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

      <div className={`bg-white rounded-2xl border shadow-sm p-5 ${autoAcceptOrders ? "border-emerald-200" : "border-gray-100"}`}>
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${autoAcceptOrders ? "bg-emerald-50" : "bg-gray-50"}`}>
            <Zap className={`w-5 h-5 ${autoAcceptOrders ? "text-emerald-500" : "text-gray-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-gray-900">{t("autoAcceptTitle")}</h3>
              {autoAcceptOrders && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">{t("autoAcceptOn")}</span>}
            </div>
            <p className="text-xs text-gray-500 mt-1 max-w-lg">
              {t("autoAcceptHelp", { pickup: settings.pickup.estimatedTime, delivery: settings.delivery.estimatedTime })}
            </p>
          </div>
          <button
            onClick={() => setAutoAcceptOrders(v => !v)}
            className="flex-shrink-0 text-gray-400 hover:text-emerald-500 transition"
            title={autoAcceptOrders ? "Disable" : "Enable"}
          >
            {autoAcceptOrders
              ? <ToggleRight className="w-8 h-8 text-emerald-500" />
              : <ToggleLeft className="w-8 h-8" />
            }
          </button>
        </div>
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
                  title={on ? "Disable" : "Enable"}
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
                      placeholder="e.g. Order online and pick up in 20 min"
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
                  {key === "reservations" && (
                    <div className="sm:col-span-3">
                      <p className="text-xs text-gray-400">
                        Configure reservation times, tables, and availability in{" "}
                        <a href="/admin/reservations" className="text-emerald-500 hover:underline font-medium">Table Reservations settings</a>.
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
