"use client";
import { useState, useEffect } from "react";
import {
  ShoppingBag, Truck, UtensilsCrossed, PartyPopper,
  Package, CalendarDays, Save, Loader2, ToggleLeft, ToggleRight,
} from "lucide-react";
import toast from "react-hot-toast";

const SERVICE_DEFS = [
  { key: "pickup",       label: "Pickup",             icon: ShoppingBag,    color: "text-blue-600",   desc: "Customers order online and pick up at the restaurant." },
  { key: "delivery",     label: "Delivery",           icon: Truck,          color: "text-green-600",  desc: "Orders are delivered to the customer's address." },
  { key: "dineIn",       label: "Dine-In",            icon: UtensilsCrossed, color: "text-orange-600", desc: "Customers order at the table or counter while dining in." },
  { key: "catering",     label: "Catering",           icon: PartyPopper,    color: "text-purple-600", desc: "Large orders for events and functions." },
  { key: "takeOut",      label: "Take Out",           icon: Package,        color: "text-yellow-600", desc: "Walk-in orders to go — separate from online pickup." },
  { key: "reservations", label: "Table Reservations", icon: CalendarDays,   color: "text-red-600",    desc: "Customers can reserve a table in advance." },
] as const;

type ServiceKey = "pickup" | "delivery" | "dineIn" | "catering" | "takeOut" | "reservations";

interface ServiceConfig {
  displayName: string;
  description: string;
  estimatedTime: number;
}

export function ServicesClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<Record<ServiceKey, boolean>>({
    pickup: true, delivery: false, dineIn: false, catering: false, takeOut: false, reservations: false,
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
    }).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/services", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, settings }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Services saved");
    } catch {
      toast.error("Failed to save services");
    }
    setSaving(false);
  };

  const updateSetting = (key: ServiceKey, field: keyof ServiceConfig, value: string | number) => {
    setSettings(s => ({ ...s, [key]: { ...s[key], [field]: value } }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Restaurant Services</h1>
          <p className="text-sm text-gray-500 mt-0.5">Enable and configure each service your restaurant offers.</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-orange-500 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-orange-600 transition text-sm shadow-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Changes
        </button>
      </div>

      <div className="space-y-4">
        {SERVICE_DEFS.map(({ key, label, icon: Icon, color, desc }) => {
          const on = enabled[key];
          return (
            <div
              key={key}
              className={`bg-white rounded-2xl border shadow-sm transition ${on ? "border-orange-200" : "border-gray-100"}`}
            >
              {/* Header row */}
              <div className="flex items-center gap-4 p-5">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${on ? "bg-orange-50" : "bg-gray-50"}`}>
                  <Icon className={`w-5 h-5 ${on ? color : "text-gray-400"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900">{label}</h3>
                    {on && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Enabled</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>
                <button
                  onClick={() => setEnabled(e => ({ ...e, [key]: !e[key] }))}
                  className="flex-shrink-0 text-gray-400 hover:text-orange-500 transition"
                  title={on ? "Disable" : "Enable"}
                >
                  {on
                    ? <ToggleRight className="w-8 h-8 text-orange-500" />
                    : <ToggleLeft className="w-8 h-8" />
                  }
                </button>
              </div>

              {/* Expanded settings when enabled */}
              {on && (
                <div className="border-t border-gray-100 px-5 py-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Display Name</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      value={settings[key].displayName}
                      onChange={e => updateSetting(key, "displayName", e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Short Description (shown to customers)</label>
                    <input
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                      placeholder="e.g. Order online and pick up in 20 min"
                      value={settings[key].description}
                      onChange={e => updateSetting(key, "description", e.target.value)}
                    />
                  </div>
                  {key !== "reservations" && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Estimated Time (min)</label>
                      <input
                        type="number" min="0" step="5"
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:outline-none"
                        value={settings[key].estimatedTime}
                        onChange={e => updateSetting(key, "estimatedTime", parseInt(e.target.value) || 0)}
                      />
                    </div>
                  )}
                  {key === "reservations" && (
                    <div className="sm:col-span-3">
                      <p className="text-xs text-gray-400">
                        Configure reservation times, tables, and availability in{" "}
                        <a href="/admin/reservations" className="text-orange-500 hover:underline font-medium">Table Reservations settings</a>.
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
