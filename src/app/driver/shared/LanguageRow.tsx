"use client";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { LOCALE_OPTIONS } from "@/lib/locales";

/**
 * Language row for the app shells (v1.1 plan §3.5) — the SAME staff-locale
 * cookie mechanism as StaffLanguageSwitcher / AuthLanguageSwitcher: write the
 * cookie, full reload, server re-resolves. NOT a second locale system.
 *
 * The /driver layout resolves its locale via resolveStaffLocale(), which reads
 * the `ff-staff-locale` cookie (STAFF_LOCALE_COOKIE in src/lib/i18n-server.ts —
 * a server-only module, so the name is repeated here) — deliberately separate
 * from the customer `fee-free-locale` cookie so a driver's choice never flips
 * a customer-facing page (Luigi 2026-06-05 decoupling).
 */
export function LanguageRow() {
  const tShared = useTranslations("feefreeShared");
  const currentLocale = useLocale();
  const onChange = (next: string) => {
    if (next === currentLocale) return;
    document.cookie = `ff-staff-locale=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-gray-300">
        <Globe className="w-4 h-4 text-gray-500" />
        {tShared("language")}
      </div>
      <select
        aria-label={tShared("language")}
        value={currentLocale}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
      >
        {LOCALE_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
