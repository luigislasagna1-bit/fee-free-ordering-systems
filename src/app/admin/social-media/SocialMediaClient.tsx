"use client";
import { useState } from "react";
import toast from "react-hot-toast";
import { Save, Share2, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  SocialIcon, PLATFORM_LABELS, PLATFORM_PLACEHOLDERS,
  type SocialPlatform,
} from "@/components/SocialIcons";

type LinkMap = Partial<Record<SocialPlatform, string>>;

interface Props {
  initialLinks: LinkMap;
  restaurantSlug: string;
}

const PLATFORMS: SocialPlatform[] = [
  "instagram", "facebook", "tiktok", "x", "youtube", "linkedin",
  "pinterest", "snapchat", "threads", "whatsapp",
  "yelp", "googleBusiness", "tripadvisor", "website",
];

export function SocialMediaClient({ initialLinks, restaurantSlug }: Props) {
  const t = useTranslations("admin.socialMedia");
  const tCommon = useTranslations("common");
  const [links, setLinks] = useState<LinkMap>(initialLinks);
  const [saving, setSaving] = useState(false);

  const setLink = (key: SocialPlatform, value: string) =>
    setLinks((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const payload: LinkMap = {};
      for (const p of PLATFORMS) {
        const v = (links[p] ?? "").trim();
        if (v) payload[p] = v;
      }
      const res = await fetch("/api/restaurants/social-media", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ socialLinks: payload }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(t("saved"));
    } catch {
      toast.error(t("saveFailed"));
    }
    setSaving(false);
  };

  const filledCount = Object.values(links).filter((v) => (v || "").trim()).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Share2 className="w-6 h-6 text-emerald-500" /> {t("title")}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t("subtitle")}</p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-600 transition text-sm disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {saving ? tCommon("loading") : tCommon("saveChanges")}
        </button>
      </div>

      <div className="max-w-3xl">
        {/* ── Links column ──────────────────────────────────────────── */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-1">
              {t("yourAccounts")}
            </div>
            <p className="text-xs text-gray-400 mb-5">
              {t("yourAccountsHelp")}: <span className="text-emerald-600 font-medium">{filledCount}</span> / {PLATFORMS.length}
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              {PLATFORMS.map((p) => {
                const value = links[p] ?? "";
                return (
                  <div key={p}>
                    <label className="text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                      <SocialIcon platform={p} className="w-4 h-4" />
                      {PLATFORM_LABELS[p]}
                    </label>
                    <div className="relative">
                      <input
                        type="url"
                        value={value}
                        onChange={(e) => setLink(p, e.target.value)}
                        placeholder={PLATFORM_PLACEHOLDERS[p]}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      />
                      {value && value.startsWith("http") && (
                        <a
                          href={value}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-emerald-600"
                          title={t("openLink")}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
            <Share2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-0.5">{t("customerPreviewTitle")}</p>
              <p className="text-blue-800">{t("customerPreviewBody")}</p>
              {restaurantSlug && (
                <a
                  href={`/order/${restaurantSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-blue-700 underline font-medium"
                >
                  /order/{restaurantSlug} <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}


