"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Map, Globe2, Eye, EyeOff, Check, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";

type Provider = "leaflet" | "google";

interface Props {
  initial: { mapProvider: Provider; googleMapsApiKey: string };
}

export function MapSettingsClient({ initial }: Props) {
  const t = useTranslations("admin.mapSettings");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");
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
      toast.success(tToasts("saved"));
    } catch (e: any) {
      toast.error(e.message || tToasts("saveFailed"));
    }
    setSaving(false);
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
      </div>

      <div className="space-y-3">
        <ProviderCard
          active={provider === "leaflet"}
          onClick={() => setProvider("leaflet")}
          icon={<Map className="w-6 h-6 text-emerald-600" />}
          title={t("leaflet")}
          activeLabel={tCommon("active")}
        />
        <ProviderCard
          active={provider === "google"}
          onClick={() => setProvider("google")}
          icon={<Globe2 className="w-6 h-6 text-blue-600" />}
          title={t("google")}
          activeLabel={tCommon("active")}
        />
      </div>

      {provider === "google" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-1 text-sm"
          >
            Google Cloud Console <ExternalLink className="w-3 h-3" />
          </a>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t("googleApiKey")}</label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-10 text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-700"
                title={showKey ? tCommon("hide") : tCommon("show")}
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">{t("googleApiKeyHelp")}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-6 py-2.5 rounded-xl transition disabled:opacity-50 inline-flex items-center gap-2"
        >
          {saving ? tCommon("loading") : tCommon("saveChanges")}
        </button>
      </div>
    </div>
  );
}

function ProviderCard({
  active, onClick, icon, title, activeLabel,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  activeLabel: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border-2 transition flex gap-4 ${
        active
          ? "border-emerald-500 bg-emerald-50/40"
          : "border-gray-200 hover:border-gray-300 bg-white"
      }`}
    >
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-gray-900">{title}</h3>
          {active && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
              <Check className="w-3 h-3" /> {activeLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
