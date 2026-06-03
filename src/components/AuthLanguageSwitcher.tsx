"use client";
import { Globe } from "lucide-react";
import { LOCALE_OPTIONS } from "@/lib/locales";

interface Props {
  currentLocale: string;
}

export function AuthLanguageSwitcher({ currentLocale }: Props) {
  const onChange = (next: string) => {
    if (next === currentLocale) return;
    document.cookie = `fee-free-locale=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };

  return (
    <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/80 backdrop-blur rounded-lg border border-gray-200 shadow-sm px-2 py-1">
      <Globe className="w-4 h-4 text-gray-500" />
      <select
        aria-label="Language"
        value={currentLocale}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-sm text-gray-700 focus:outline-none cursor-pointer pr-1"
      >
        {LOCALE_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
