"use client";
import { useState, useRef, useEffect } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { LOCALE_OPTIONS } from "@/lib/locales";

interface Props {
  currentLocale: string;
}

/**
 * Language switcher. A custom button + dropdown (NOT a native <select>): a native
 * select always reserves width for its WIDEST option, and with 38 languages that
 * left a long dead space after the short current value ("English") — overflowing
 * the mobile ordering-page header and pushing the action buttons onto a 2nd line
 * (Luigi 2026-06-22). This button sizes to the CURRENT value only; the dropdown
 * lists every language in full.
 */
export function LanguageSwitcher({ currentLocale }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LOCALE_OPTIONS.find((o) => o.code === currentLocale) ?? LOCALE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const choose = (next: string) => {
    setOpen(false);
    if (next === currentLocale) return;
    // Cookie is read by src/i18n/request.ts on the next request.
    document.cookie = `fee-free-locale=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 max-w-[40vw] sm:max-w-none px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        <Globe className="w-4 h-4 text-gray-500 flex-shrink-0" />
        <span className="truncate">{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="Language"
          className="absolute left-0 z-50 mt-1 max-h-72 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {LOCALE_OPTIONS.map((o) => (
            <li key={o.code}>
              <button
                type="button"
                role="option"
                aria-selected={o.code === currentLocale}
                onClick={() => choose(o.code)}
                className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 ${
                  o.code === currentLocale ? "font-semibold text-emerald-600" : "text-gray-700"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
