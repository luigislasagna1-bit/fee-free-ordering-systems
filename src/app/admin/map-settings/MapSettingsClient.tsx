"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Map, Globe2, Eye, EyeOff, Check, ExternalLink, AlertTriangle } from "lucide-react";

type Provider = "leaflet" | "google";

interface Props {
  initial: { mapProvider: Provider; googleMapsApiKey: string };
}

export function MapSettingsClient({ initial }: Props) {
  const [provider, setProvider] = useState<Provider>(initial.mapProvider);
  const [apiKey, setApiKey] = useState(initial.googleMapsApiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapProvider: provider,
          googleMapsApiKey: provider === "google" ? apiKey.trim() : "",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.success("Map settings saved");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Map Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose how maps render across your delivery zones, restaurant info page, and admin tools.
        </p>
      </div>

      <div className="space-y-3">
        <ProviderCard
          active={provider === "leaflet"}
          onClick={() => setProvider("leaflet")}
          icon={<Map className="w-6 h-6 text-emerald-600" />}
          title="Leaflet (OpenStreetMap)"
          tagline="Free, no setup, works out of the box."
          bullets={[
            "No API key required",
            "Uses OpenStreetMap tiles — community-driven, accurate worldwide",
            "Good fit for new restaurants and lower-volume sites",
          ]}
        />
        <ProviderCard
          active={provider === "google"}
          onClick={() => setProvider("google")}
          icon={<Globe2 className="w-6 h-6 text-blue-600" />}
          title="Google Maps"
          tagline="Familiar look, address autocomplete on checkout."
          bullets={[
            "Requires your own Google Cloud API key",
            "Adds Google Places suggestions on the delivery address field",
            "$200/month free credit covers ~28,000 map loads — most single-restaurant volume stays free",
          ]}
        />
      </div>

      {provider === "google" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div>
            <h2 className="font-bold text-gray-900">How to get your Google Maps API key</h2>
            <p className="text-xs text-gray-500 mt-0.5">One-time setup. Once you paste your key below, every map on your site uses Google Maps.</p>
          </div>

          <ol className="space-y-2.5 text-sm text-gray-700 list-decimal pl-5">
            <li>
              Open{" "}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Google Cloud Console <ExternalLink className="w-3 h-3" />
              </a>
              {" "}and create a project (or pick an existing one).
            </li>
            <li>
              Go to <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">APIs &amp; Services → Library</span> and{" "}
              <strong>enable</strong> both of these APIs:
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                <li>Maps JavaScript API</li>
                <li>Places API</li>
              </ul>
            </li>
            <li>
              Go to <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">APIs &amp; Services → Credentials</span>, click{" "}
              <strong>Create credentials → API key</strong>. Copy the key it shows.
            </li>
            <li>
              Click your new key to edit it. Under <strong>Application restrictions</strong>, choose{" "}
              <strong>HTTP referrers</strong> and add your domain(s), e.g.:
              <ul className="list-disc pl-5 mt-1 space-y-0.5 font-mono text-xs">
                <li>https://your-domain.com/*</li>
                <li>http://localhost:3001/*  <span className="text-gray-400 font-sans">(for dev)</span></li>
              </ul>
            </li>
            <li>
              Under <strong>API restrictions</strong>, select <strong>Restrict key</strong> and tick the two APIs you enabled. Save.
            </li>
            <li>Paste your key below and click <strong>Save</strong>.</li>
          </ol>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2 text-xs text-amber-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Always restrict your key to your domain.</strong> An unrestricted key can be abused by anyone who finds it in your site's source, which would run up your Google bill.
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps API Key</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700"
                title={showKey ? "Hide key" : "Show key"}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Stored on your restaurant only. Used client-side to load Google Maps in the browser.
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded-xl transition disabled:opacity-50 inline-flex items-center gap-2"
        >
          {saving ? "Saving…" : "Save Map Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Provider card ───────────────────────────────────────────────────────────
function ProviderCard({
  active, onClick, icon, title, tagline, bullets,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  tagline: string;
  bullets: string[];
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border-2 transition flex gap-4 ${
        active
          ? "border-orange-500 bg-orange-50/40"
          : "border-gray-200 hover:border-gray-300 bg-white"
      }`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-900">{title}</h3>
          {active && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">
              <Check className="w-3 h-3" /> Active
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-0.5">{tagline}</p>
        <ul className="mt-2 space-y-1 text-xs text-gray-500">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2"><span className="text-gray-400">•</span> {b}</li>
          ))}
        </ul>
      </div>
    </button>
  );
}
