"use client";
import { Globe } from "lucide-react";
import { LOCALE_OPTIONS } from "@/lib/locales";

interface Props {
  currentLocale: string;
}

export function LanguageSwitcher({ currentLocale }: Props) {
  const onChange = (next: string) => {
    if (next === currentLocale) return;
    // Cookie is read by src/i18n/request.ts on the next request
    document.cookie = `fee-free-locale=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };

  return (
    <div className="relative inline-flex items-center min-w-0 max-w-full">
      <Globe className="w-4 h-4 text-gray-500 absolute left-2 pointer-events-none" />
      {/* A native <select> auto-sizes to its WIDEST option — with 38 languages the
          longest label (e.g. "Português (Brasil)") blew the control out and overflowed
          the mobile header. Cap it on phones + truncate the shown value (the dropdown
          list still shows full names); unconstrained on desktop. Luigi 2026-06-22. */}
      <select
        aria-label="Language"
        value={currentLocale}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none max-w-[42vw] sm:max-w-none truncate pl-7 pr-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {LOCALE_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
