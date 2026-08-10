"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { PhoneOutgoing } from "lucide-react";

/**
 * Number + live status strip shown above the tabs on every Nabil dashboard
 * tab: the "Active — handling calls" green dot, the master Enable toggle
 * (reuses the existing /api/admin/phone-ordering PATCH) and a "test call"
 * hint with a tel: link to the restaurant's own Nabil number.
 */
export default function NabilStatusHeader({
  initialEnabled,
  phoneNumber,
}: {
  initialEnabled: boolean;
  phoneNumber: string | null;
}) {
  const t = useTranslations("admin.phoneOrderingPage.overview");
  const tc = useTranslations("admin.phoneOrderingPage.config");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    setEnabled(next); // optimistic — reverted on failure
    try {
      const res = await fetch("/api/admin/phone-ordering", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) throw new Error();
      toast.success(tc("saved"));
      router.refresh();
    } catch {
      setEnabled(!next);
      toast.error(tc("saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <div className="text-xs text-gray-500">{tc("numberLabel")}</div>
          <div className="font-mono font-semibold text-gray-900">
            {phoneNumber || <span className="text-amber-600 font-sans font-normal">{tc("noNumber")}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${enabled ? "bg-emerald-500 animate-pulse" : "bg-gray-300"}`}
            aria-hidden
          />
          <span className={`text-sm font-semibold ${enabled ? "text-emerald-700" : "text-gray-500"}`}>
            {enabled ? t("statusActive") : t("statusPaused")}
          </span>
        </div>
        {phoneNumber && (
          <a
            href={`tel:${phoneNumber}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 transition"
          >
            <PhoneOutgoing className="w-3.5 h-3.5" />
            {t("testCall")}
          </a>
        )}
      </div>
      <label className="flex items-center gap-3 cursor-pointer">
        <span className="text-sm text-gray-800">{tc("enable")}</span>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          className={`relative w-11 h-6 rounded-full transition ${enabled ? "bg-emerald-600" : "bg-gray-300"} disabled:opacity-60`}
          aria-pressed={enabled}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition ${enabled ? "translate-x-5" : ""}`} />
        </button>
      </label>
    </div>
  );
}
