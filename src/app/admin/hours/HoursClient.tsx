"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Save, Clock } from "lucide-react";
import { useTranslations } from "next-intl";

export function HoursClient({ hours: initial }: { hours: any[] }) {
  const tSidebar = useTranslations("admin.sidebar");
  const tHours = useTranslations("admin.hours");
  const tInfo = useTranslations("info");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");

  const [hours, setHours] = useState(
    [0, 1, 2, 3, 4, 5, 6].map((i) => initial.find((h) => h.dayOfWeek === i) || { dayOfWeek: i, isOpen: false, openTime: "09:00", closeTime: "21:00" })
  );
  const [loading, setLoading] = useState(false);

  const update = (day: number, field: string, value: any) => {
    setHours(hours.map((h) => h.dayOfWeek === day ? { ...h, [field]: value } : h));
  };

  const save = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/restaurants/hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(tToasts("saved"));
    } catch { toast.error(tToasts("saveFailed")); }
    setLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{tSidebar("openingHours")}</h1>
        <button
          onClick={save}
          disabled={loading}
          className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition text-sm"
        >
          <Save className="w-4 h-4" /> {loading ? tCommon("loading") : tCommon("saveChanges")}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          {tInfo("openingHours")}
        </div>
        {hours.map((h) => (
          <div key={h.dayOfWeek} className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <div className="w-28 font-medium text-gray-900">{tInfo(`days.${h.dayOfWeek}`)}</div>
            <button
              onClick={() => update(h.dayOfWeek, "isOpen", !h.isOpen)}
              className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${h.isOpen ? "bg-emerald-500" : "bg-gray-300"}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${h.isOpen ? "translate-x-6" : "translate-x-0"}`} />
            </button>
            {h.isOpen ? (
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={h.openTime}
                  onChange={(e) => update(h.dayOfWeek, "openTime", e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-gray-400">{tCommon("to")}</span>
                <input
                  type="time"
                  value={h.closeTime}
                  onChange={(e) => update(h.dayOfWeek, "closeTime", e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            ) : (
              <span className="text-gray-400 text-sm">{tHours("closedDay")}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
