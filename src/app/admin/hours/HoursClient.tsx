"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Save, Clock } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function HoursClient({ hours: initial }: { hours: any[] }) {
  const [hours, setHours] = useState(
    DAYS.map((_, i) => initial.find((h) => h.dayOfWeek === i) || { dayOfWeek: i, isOpen: false, openTime: "09:00", closeTime: "21:00" })
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
      toast.success("Opening hours saved!");
    } catch { toast.error("Failed to save hours"); }
    setLoading(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Opening Hours</h1>
        <button
          onClick={save}
          disabled={loading}
          className="flex items-center gap-2 bg-orange-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition text-sm"
        >
          <Save className="w-4 h-4" /> {loading ? "Saving..." : "Save Hours"}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2 text-sm text-gray-600">
          <Clock className="w-4 h-4" />
          Set your regular weekly schedule. You can update these anytime.
        </div>
        {hours.map((h) => (
          <div key={h.dayOfWeek} className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
            <div className="w-28 font-medium text-gray-900">{DAYS[h.dayOfWeek]}</div>
            <button
              onClick={() => update(h.dayOfWeek, "isOpen", !h.isOpen)}
              className={`w-12 h-6 rounded-full transition-colors flex-shrink-0 ${h.isOpen ? "bg-orange-500" : "bg-gray-300"}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${h.isOpen ? "translate-x-6" : "translate-x-0"}`} />
            </button>
            {h.isOpen ? (
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={h.openTime}
                  onChange={(e) => update(h.dayOfWeek, "openTime", e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="time"
                  value={h.closeTime}
                  onChange={(e) => update(h.dayOfWeek, "closeTime", e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            ) : (
              <span className="text-gray-400 text-sm">Closed</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
