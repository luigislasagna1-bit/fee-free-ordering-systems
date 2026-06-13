"use client";
import { useState } from "react";
import toast from "react-hot-toast";

interface Props {
  initial: {
    googleMapsApiKey: string;
    updatedAt: string | null;
    suggestion: { name: string; key: string } | null;
  };
}

export function MapsSettingsClient({ initial }: Props) {
  const [key, setKey] = useState(initial.googleMapsApiKey);
  const [saving, setSaving] = useState(false);
  const active = !!initial.googleMapsApiKey.trim();

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/superadmin/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleMapsApiKey: key.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Save failed");
      toast.success("Platform Google Maps key saved");
      setTimeout(() => window.location.reload(), 600);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
    setSaving(false);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Platform Google Maps</h1>
        <p className="text-sm text-gray-500 mt-1">
          One Google Maps key for <strong>every</strong> restaurant — maps, Places autocomplete,
          and delivery distance. A restaurant&apos;s own key (if they set one) still takes precedence.
        </p>
      </div>

      <div
        className={`inline-flex items-center gap-2 text-xs font-bold px-2.5 py-1 rounded-full ${
          active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
        }`}
      >
        {active ? "● Active — every restaurant is using this key" : "○ Not set — restaurants fall back to the free map"}
      </div>

      {initial.suggestion && key.trim() !== initial.suggestion.key && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-center justify-between gap-3">
          <span>
            Use the Google key already set up on <strong>{initial.suggestion.name}</strong>?
          </span>
          <button
            onClick={() => setKey(initial.suggestion!.key)}
            className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg whitespace-nowrap"
          >
            Use it
          </button>
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps API key</label>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="AIzaSy…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        />
        <p className="text-xs text-gray-500 mt-1 leading-relaxed">
          In Google Cloud, restrict it to your domains (HTTP referrers) + the Maps JavaScript,
          Places, and Distance Matrix APIs, and set a billing budget alert. Leave blank to disable
          the platform key (restaurants then use the free Leaflet/OSM map).
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl transition disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {initial.updatedAt && (
          <span className="text-xs text-gray-400">
            Last updated {new Date(initial.updatedAt).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
