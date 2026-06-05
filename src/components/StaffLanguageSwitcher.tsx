"use client";
import { Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { LOCALE_OPTIONS } from "@/lib/locales";

/**
 * Per-staff console language picker (admin + kitchen). Writes the dedicated
 * `ff-staff-locale` cookie — SEPARATE from the customer `fee-free-locale`
 * cookie — so a staff member's choice only affects their own console and never
 * the customer ordering page (and vice-versa). See resolveStaffLocale.
 * Luigi 2026-06-05.
 */
export function StaffLanguageSwitcher() {
  const currentLocale = useLocale();
  const onChange = (next: string) => {
    if (next === currentLocale) return;
    document.cookie = `ff-staff-locale=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };
  return (
    <div className="relative inline-flex items-center">
      <Globe className="w-4 h-4 text-gray-400 absolute left-2 pointer-events-none" />
      <select
        aria-label="Console language"
        value={currentLocale}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-7 pr-6 py-1.5 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {LOCALE_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
