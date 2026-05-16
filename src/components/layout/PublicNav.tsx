"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X, ChefHat, Globe } from "lucide-react";
import { useTranslations } from "next-intl";

const LOCALES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
];

interface Props {
  currentLocale?: string;
}

export function PublicNav({ currentLocale = "en" }: Props) {
  const t = useTranslations("marketing.nav");
  const [open, setOpen] = useState(false);

  const onLocaleChange = (next: string) => {
    if (next === currentLocale) return;
    document.cookie = `fee-free-locale=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };

  const items: [string, string][] = [
    [t("features"), "/features"],
    [t("pricing"), "/pricing"],
    [t("faq"), "/faq"],
    [t("demo"), "/demo"],
  ];

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl text-orange-500">
          <ChefHat className="w-7 h-7" />
          Fee Free Ordering
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {items.map(([label, href]) => (
            <Link key={href} href={href} className="text-gray-600 hover:text-orange-500 font-medium transition">
              {label}
            </Link>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="relative inline-flex items-center">
            <Globe className="w-4 h-4 text-gray-500 absolute left-2 pointer-events-none" />
            <select
              aria-label="Language"
              value={currentLocale}
              onChange={(e) => onLocaleChange(e.target.value)}
              className="appearance-none pl-7 pr-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
            >
              {LOCALES.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>
          <Link href="/login" className="text-gray-700 font-medium hover:text-orange-500 transition">
            {t("login")}
          </Link>
          <Link
            href="/signup"
            className="bg-orange-500 text-white font-semibold px-5 py-2 rounded-lg hover:bg-orange-600 transition"
          >
            {t("startTrial")}
          </Link>
        </div>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 -mr-2 cursor-pointer touch-manipulation text-gray-700 active:bg-gray-100 rounded-lg"
        >
          {open ? <X className="w-6 h-6 pointer-events-none" /> : <Menu className="w-6 h-6 pointer-events-none" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-gray-100 px-4 py-4 space-y-3 bg-white">
          {items.map(([l, h]) => (
            <Link key={h} href={h} className="block text-gray-700 font-medium py-1" onClick={() => setOpen(false)}>
              {l}
            </Link>
          ))}
          <div className="pt-2 border-t border-gray-100 space-y-2">
            <select
              aria-label="Language"
              value={currentLocale}
              onChange={(e) => onLocaleChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700"
            >
              {LOCALES.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
            <Link href="/login" className="block text-gray-700 font-medium py-1">{t("login")}</Link>
            <Link href="/signup" className="block bg-orange-500 text-white font-semibold px-5 py-2 rounded-lg text-center">
              {t("startTrial")}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
