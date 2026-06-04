/**
 * Supported locales — the single source of truth.
 *
 * Client-safe (no server imports), so the language switchers, admin
 * pickers, request config, and server resolver all read the SAME list.
 * Adding a language = drop a `src/messages/<code>.json` dictionary and add
 * one row here.
 *
 * Each code must have a matching `src/messages/<code>.json`. The i18n
 * request config / resolver `import(@/messages/${locale}.json)` at runtime,
 * so a code listed here WITHOUT a dictionary file would crash on selection.
 */

export const LOCALE_LABELS = {
  en: "English",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  "pt-BR": "Português (BR)",
  de: "Deutsch",
  nl: "Nederlands",
  ro: "Română",
  sv: "Svenska",
  da: "Dansk",
  nb: "Norsk",
  fi: "Suomi",
  pl: "Polski",
  cs: "Čeština",
  sk: "Slovenčina",
  hu: "Magyar",
  el: "Ελληνικά",
  bg: "Български",
  hr: "Hrvatski",
  sr: "Српски",
  sl: "Slovenščina",
  et: "Eesti",
  lv: "Latviešu",
  lt: "Lietuvių",
  tr: "Türkçe",
  ru: "Русский",
  uk: "Українська",
  ca: "Català",
  id: "Bahasa Indonesia",
  vi: "Tiếng Việt",
  th: "ไทย",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  ar: "العربية",
  he: "עברית",
  hi: "हिन्दी",
} as const;

export type Locale = keyof typeof LOCALE_LABELS;

export const SUPPORTED_LOCALES = Object.keys(LOCALE_LABELS) as Locale[];

export const DEFAULT_LOCALE: Locale = "en";

/** Right-to-left locales — drive the `dir="rtl"` attribute on the document
 *  so Arabic / Hebrew render with correct text direction. */
export const RTL_LOCALES = new Set<Locale>(["ar", "he"]);

export function isSupportedLocale(value: unknown): value is Locale {
  return typeof value === "string" && (SUPPORTED_LOCALES as string[]).includes(value);
}

export function isRtlLocale(value: unknown): boolean {
  return isSupportedLocale(value) && RTL_LOCALES.has(value);
}

/** [{ code, label }] for rendering language pickers. */
export const LOCALE_OPTIONS: { code: Locale; label: string }[] = SUPPORTED_LOCALES.map(
  (code) => ({ code, label: LOCALE_LABELS[code] }),
);
