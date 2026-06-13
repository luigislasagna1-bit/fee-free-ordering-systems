"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Map, Globe2, Eye, EyeOff, Check, ExternalLink, Info, DollarSign, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

type Provider = "leaflet" | "google";

interface Props {
  initial: { mapProvider: Provider; googleMapsApiKey: string };
  /** True when the platform provides a Google Maps browser key for every
   *  restaurant — then Google is included with zero setup and the per-restaurant
   *  key is only an optional override. */
  platformKeyConfigured?: boolean;
}

export function MapSettingsClient({ initial, platformKeyConfigured = false }: Props) {
  const t = useTranslations("admin.mapSettings");
  const tCommon = useTranslations("common");
  const tToasts = useTranslations("admin.toasts");
  const [provider, setProvider] = useState<Provider>(initial.mapProvider);
  const [apiKey, setApiKey] = useState(initial.googleMapsApiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [showAdvancedKey, setShowAdvancedKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/restaurants/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // With the platform key, Google is always available — saving here just
          // records the OPTIONAL own-key override (and keeps provider = google).
          mapProvider: platformKeyConfigured ? "google" : provider,
          googleMapsApiKey: platformKeyConfigured || provider === "google" ? apiKey.trim() : "",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      toast.success(tToasts("saved"));
    } catch (e: any) {
      toast.error(e.message || tToasts("saveFailed"));
    }
    setSaving(false);
  };

  // ── Platform-provided Google: included for every restaurant, zero setup ──
  // (Luigi 2026-06-13). The owner no longer makes a Google Cloud project — their
  // own key is just an optional override. NOTE: the descriptive prose below is
  // English-only, matching this page's pre-existing hardcoded descriptions; flag
  // for a full map-settings i18n pass.
  if (platformKeyConfigured) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>

        <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/40 p-5 flex gap-4">
          <Globe2 className="w-6 h-6 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-gray-900">{t("google")}</h3>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
                <Check className="w-3 h-3" /> Included &amp; active
              </span>
            </div>
            <p className="mt-1.5 text-sm text-gray-600 leading-relaxed">
              Google Maps is included on all your pages — your ordering page, delivery map, and kitchen distance — at no cost to you. We provide it, so there&apos;s nothing to set up. It&apos;s already live.
            </p>
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowAdvancedKey((s) => !s)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700"
          >
            {showAdvancedKey ? "−" : "+"} Advanced: use your own Google key (optional)
          </button>
          {showAdvancedKey && (
            <div className="mt-3 bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
              <p className="text-xs text-gray-500 leading-relaxed">
                Optional. Leave this blank to use the included Google Maps. Add your own Google Cloud key only if you&apos;d rather run the maps on your own Google billing (e.g. very high volume).
              </p>
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
              </div>
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
          )}
        </div>
      </div>
    );
  }

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
          badge={
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
              <Sparkles className="w-3 h-3" /> FREE — RECOMMENDED
            </span>
          }
          description="Standard map (OpenStreetMap data). No account, no API key, no cost. Looks great and works everywhere. Most restaurants use this and never look back."
        />
        <ProviderCard
          active={provider === "google"}
          onClick={() => setProvider("google")}
          icon={<Globe2 className="w-6 h-6 text-blue-600" />}
          title={t("google")}
          activeLabel={tCommon("active")}
          badge={
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 rounded-full px-2 py-0.5">
              <DollarSign className="w-3 h-3" /> NEEDS YOUR OWN API KEY
            </span>
          }
          description="More polished look + Street View. You sign up at Google Cloud, get an API key, paste it below. Google gives a $200/month free credit (≈ 28,000 map loads). Past that: ~$7 per additional 1,000 loads. For a small restaurant page, you'll almost certainly stay within the free tier."
        />
      </div>

      {provider === "google" && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 shadow-sm">
          {/* Inline how-to-get-an-API-key guide. Most restaurant owners
              have never touched Google Cloud Console so we walk them
              through it instead of just dropping a link. */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-bold text-blue-900">How to get your Google Maps API key (≈ 5 min)</h4>
            </div>
            <ol className="text-xs text-blue-900 leading-relaxed space-y-2 list-decimal pl-5">
              <li>
                Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="font-semibold underline">console.cloud.google.com</a> and sign in with a Google account.
              </li>
              <li>
                Top bar → click the project dropdown → <strong>New Project</strong>. Name it whatever (&quot;My Restaurant Maps&quot;).
              </li>
              <li>
                Left menu (≡) → <strong>APIs &amp; Services → Library</strong>. Search for and enable: <strong>Maps JavaScript API</strong>, <strong>Geocoding API</strong>, and <strong>Places API</strong>.
              </li>
              <li>
                Left menu → <strong>APIs &amp; Services → Credentials → + Create Credentials → API key</strong>. Copy the key (starts with <code className="bg-white/60 px-1 rounded">AIzaSy…</code>).
              </li>
              <li>
                Click the key, then under <strong>Application restrictions</strong> choose <em>HTTP referrers</em> and add your restaurant&apos;s domain (e.g. <code className="bg-white/60 px-1 rounded">*.yourrestaurant.com/*</code>). This prevents anyone else from using your key. <strong>Important</strong> — without restrictions, a leaked key can run up your bill.
              </li>
              <li>
                Google requires a billing account on file even for the free tier. Add a credit card under <strong>Billing</strong>. You won&apos;t be charged unless you exceed the $200/month free credit — and they email you long before that happens.
              </li>
              <li>Paste the key below and click Save.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition"
              >
                Open Google Cloud Console <ExternalLink className="w-3 h-3" />
              </a>
              <a
                href="https://mapsplatform.google.com/pricing/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
              >
                See current pricing <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>

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
  active, onClick, icon, title, activeLabel, badge, description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  activeLabel: string;
  badge?: React.ReactNode;
  description?: string;
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
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="font-bold text-gray-900">{title}</h3>
          {badge}
          {active && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 rounded-full px-2 py-0.5">
              <Check className="w-3 h-3" /> {activeLabel}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">{description}</p>
        )}
      </div>
    </button>
  );
}
