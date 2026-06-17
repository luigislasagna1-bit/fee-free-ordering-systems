"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Loader2, BarChart3 } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Interactive Integrations card for the owner's own Facebook Pixel / Google
 * Analytics. Enter the ID → PATCH /api/admin/integrations (validated). When set,
 * the card shows Active and the ID is injected on the ordering page. Clearing
 * the field removes the tracking. Luigi 2026-06-17.
 */
export function IntegrationTrackingCard({
  provider,
  name,
  initialValue,
}: {
  provider: "facebook" | "google";
  name: string;
  initialValue: string | null;
}) {
  const t = useTranslations("admin.integrations");
  const tc = useTranslations("common");
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  const field = provider === "facebook" ? "facebookPixelId" : "googleAnalyticsId";
  const placeholder = provider === "facebook" ? "123456789012345" : "G-XXXXXXXXXX";
  const hint = provider === "facebook" ? t("pixelHint") : t("gaHint");
  const isSet = !!initialValue;
  const dirty = value.trim() !== (initialValue ?? "");

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/integrations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [field]: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }
      toast.success(value.trim() ? t("trackingSaved") : t("trackingCleared"));
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full bg-white rounded-2xl border border-gray-200 p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="w-11 h-11 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center flex-shrink-0">
          <BarChart3 className="w-5 h-5 text-gray-600" />
        </div>
        {isSet && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
            <Check className="w-3 h-3" /> {tc("active")}
          </span>
        )}
      </div>
      <div className="mt-3 font-bold text-gray-900">{name}</div>
      <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">{t("catMarketing")}</div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <p className="text-[11px] text-gray-400 mt-1.5 leading-snug flex-1">{hint}</p>
      <button
        onClick={save}
        disabled={saving || !dirty}
        className="mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-40"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {t("save")}
      </button>
      <p className="text-[10px] text-gray-400 mt-2 leading-snug">{t("trackingConsentNote")}</p>
    </div>
  );
}
