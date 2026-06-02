/**
 * Region / locale source of truth for worldwide launch.
 *
 * ONE setting drives the rest: when a restaurant owner picks their
 * Country, we derive sensible defaults for timezone, currency, default
 * language, and address-field labels. Each is still individually
 * overridable in the admin profile (multi-timezone countries MUST pick
 * their zone). These values live on the Restaurant row (country,
 * timezone, currency, defaultLanguage) and propagate everywhere.
 *
 * Adding or correcting a country here is the single place to do it.
 *
 * Notes:
 *  - `code` is ISO 3166-1 alpha-2 (uppercase) — matches existing
 *    Restaurant.country values ("US", "CA", "GB", ...).
 *  - `currency` is lowercase ISO 4217 to match the stored
 *    Restaurant.currency convention ("usd"). formatCurrency() uppercases.
 *  - `language` is the IDEAL locale for the country. Callers clamp it to
 *    the currently-supported set via isSupportedLocale() — so a German
 *    restaurant gets "de" only once the German dictionary ships; until
 *    then it gracefully resolves to English.
 *  - `timezones[0]` is the default; the rest let multi-zone countries
 *    refine. Single-zone countries list just one.
 */

export type CountryRegion = {
  code: string;
  name: string;
  timezones: string[];
  currency: string;
  /** Ideal locale code; clamp to supported set before persisting/consuming. */
  language: string;
  /** Label for the "state" address field, or null when the country has no
   *  meaningful sub-division in addresses (most of Europe). */
  stateLabel: string | null;
  postalLabel: string;
  hoursFormat: "12h" | "24h";
};

// Ordered: common markets first, then alphabetical-ish by region. The
// admin dropdown renders in this order.
export const COUNTRIES: CountryRegion[] = [
  // ── North America ──────────────────────────────────────────────
  { code: "US", name: "United States", currency: "usd", language: "en", stateLabel: "State", postalLabel: "ZIP code", hoursFormat: "12h",
    timezones: ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"] },
  { code: "CA", name: "Canada", currency: "cad", language: "en", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "12h",
    timezones: ["America/Toronto", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Halifax", "America/St_Johns"] },
  { code: "MX", name: "Mexico", currency: "mxn", language: "es", stateLabel: "State", postalLabel: "Postal code", hoursFormat: "12h",
    timezones: ["America/Mexico_City", "America/Cancun", "America/Monterrey", "America/Tijuana"] },

  // ── United Kingdom & Ireland ───────────────────────────────────
  { code: "GB", name: "United Kingdom", currency: "gbp", language: "en", stateLabel: null, postalLabel: "Postcode", hoursFormat: "12h",
    timezones: ["Europe/London"] },
  { code: "IE", name: "Ireland", currency: "eur", language: "en", stateLabel: "County", postalLabel: "Eircode", hoursFormat: "24h",
    timezones: ["Europe/Dublin"] },

  // ── Western / Central Europe ───────────────────────────────────
  { code: "IT", name: "Italy", currency: "eur", language: "it", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Rome"] },
  { code: "FR", name: "France", currency: "eur", language: "fr", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Paris"] },
  { code: "DE", name: "Germany", currency: "eur", language: "de", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Berlin"] },
  { code: "ES", name: "Spain", currency: "eur", language: "es", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Madrid", "Atlantic/Canary"] },
  { code: "PT", name: "Portugal", currency: "eur", language: "pt", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Lisbon", "Atlantic/Azores", "Atlantic/Madeira"] },
  { code: "NL", name: "Netherlands", currency: "eur", language: "nl", stateLabel: null, postalLabel: "Postcode", hoursFormat: "24h", timezones: ["Europe/Amsterdam"] },
  { code: "BE", name: "Belgium", currency: "eur", language: "nl", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Brussels"] },
  { code: "AT", name: "Austria", currency: "eur", language: "de", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Vienna"] },
  { code: "CH", name: "Switzerland", currency: "chf", language: "de", stateLabel: "Canton", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Zurich"] },
  { code: "LU", name: "Luxembourg", currency: "eur", language: "fr", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Luxembourg"] },

  // ── Nordics ────────────────────────────────────────────────────
  { code: "SE", name: "Sweden", currency: "sek", language: "sv", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Stockholm"] },
  { code: "NO", name: "Norway", currency: "nok", language: "nb", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Oslo"] },
  { code: "DK", name: "Denmark", currency: "dkk", language: "da", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Copenhagen"] },
  { code: "FI", name: "Finland", currency: "eur", language: "fi", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Helsinki"] },
  { code: "IS", name: "Iceland", currency: "isk", language: "en", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Atlantic/Reykjavik"] },

  // ── Eastern / Southern Europe ──────────────────────────────────
  { code: "PL", name: "Poland", currency: "pln", language: "pl", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Warsaw"] },
  { code: "CZ", name: "Czechia", currency: "czk", language: "cs", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Prague"] },
  { code: "SK", name: "Slovakia", currency: "eur", language: "sk", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Bratislava"] },
  { code: "HU", name: "Hungary", currency: "huf", language: "hu", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Budapest"] },
  { code: "RO", name: "Romania", currency: "ron", language: "ro", stateLabel: "County", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Bucharest"] },
  { code: "BG", name: "Bulgaria", currency: "bgn", language: "bg", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Sofia"] },
  { code: "GR", name: "Greece", currency: "eur", language: "el", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Athens"] },
  { code: "HR", name: "Croatia", currency: "eur", language: "hr", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Zagreb"] },
  { code: "RS", name: "Serbia", currency: "rsd", language: "sr", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Belgrade"] },
  { code: "SI", name: "Slovenia", currency: "eur", language: "sl", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Ljubljana"] },
  { code: "EE", name: "Estonia", currency: "eur", language: "et", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Tallinn"] },
  { code: "LV", name: "Latvia", currency: "eur", language: "lv", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Riga"] },
  { code: "LT", name: "Lithuania", currency: "eur", language: "lt", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Vilnius"] },
  { code: "UA", name: "Ukraine", currency: "uah", language: "uk", stateLabel: "Oblast", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Kyiv"] },
  { code: "RU", name: "Russia", currency: "rub", language: "ru", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h",
    timezones: ["Europe/Moscow", "Europe/Kaliningrad", "Asia/Yekaterinburg", "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Vladivostok"] },

  // ── Middle East ────────────────────────────────────────────────
  { code: "AE", name: "United Arab Emirates", currency: "aed", language: "ar", stateLabel: "Emirate", postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Asia/Dubai"] },
  { code: "SA", name: "Saudi Arabia", currency: "sar", language: "ar", stateLabel: "Region", postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Asia/Riyadh"] },
  { code: "QA", name: "Qatar", currency: "qar", language: "ar", stateLabel: null, postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Asia/Qatar"] },
  { code: "IL", name: "Israel", currency: "ils", language: "he", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Asia/Jerusalem"] },
  { code: "TR", name: "Türkiye", currency: "try", language: "tr", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Europe/Istanbul"] },

  // ── Asia-Pacific ───────────────────────────────────────────────
  { code: "AU", name: "Australia", currency: "aud", language: "en", stateLabel: "State/Territory", postalLabel: "Postcode", hoursFormat: "12h",
    timezones: ["Australia/Sydney", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Australia/Darwin", "Australia/Hobart"] },
  { code: "NZ", name: "New Zealand", currency: "nzd", language: "en", stateLabel: null, postalLabel: "Postcode", hoursFormat: "12h", timezones: ["Pacific/Auckland"] },
  { code: "JP", name: "Japan", currency: "jpy", language: "ja", stateLabel: "Prefecture", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Asia/Tokyo"] },
  { code: "KR", name: "South Korea", currency: "krw", language: "ko", stateLabel: null, postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Asia/Seoul"] },
  { code: "CN", name: "China", currency: "cny", language: "zh", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Asia/Shanghai"] },
  { code: "HK", name: "Hong Kong", currency: "hkd", language: "zh", stateLabel: null, postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Asia/Hong_Kong"] },
  { code: "TW", name: "Taiwan", currency: "twd", language: "zh", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Asia/Taipei"] },
  { code: "SG", name: "Singapore", currency: "sgd", language: "en", stateLabel: null, postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Asia/Singapore"] },
  { code: "MY", name: "Malaysia", currency: "myr", language: "en", stateLabel: "State", postalLabel: "Postcode", hoursFormat: "12h", timezones: ["Asia/Kuala_Lumpur"] },
  { code: "ID", name: "Indonesia", currency: "idr", language: "id", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] },
  { code: "TH", name: "Thailand", currency: "thb", language: "th", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Asia/Bangkok"] },
  { code: "VN", name: "Vietnam", currency: "vnd", language: "vi", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Asia/Ho_Chi_Minh"] },
  { code: "PH", name: "Philippines", currency: "php", language: "en", stateLabel: "Province", postalLabel: "ZIP code", hoursFormat: "12h", timezones: ["Asia/Manila"] },
  { code: "IN", name: "India", currency: "inr", language: "en", stateLabel: "State", postalLabel: "PIN code", hoursFormat: "12h", timezones: ["Asia/Kolkata"] },

  // ── Latin America ──────────────────────────────────────────────
  { code: "BR", name: "Brazil", currency: "brl", language: "pt-BR", stateLabel: "State", postalLabel: "CEP", hoursFormat: "24h",
    timezones: ["America/Sao_Paulo", "America/Manaus", "America/Fortaleza", "America/Bahia"] },
  { code: "AR", name: "Argentina", currency: "ars", language: "es", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["America/Argentina/Buenos_Aires"] },
  { code: "CL", name: "Chile", currency: "clp", language: "es", stateLabel: "Region", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["America/Santiago"] },
  { code: "CO", name: "Colombia", currency: "cop", language: "es", stateLabel: "Department", postalLabel: "Postal code", hoursFormat: "12h", timezones: ["America/Bogota"] },
  { code: "PE", name: "Peru", currency: "pen", language: "es", stateLabel: "Region", postalLabel: "Postal code", hoursFormat: "12h", timezones: ["America/Lima"] },

  // ── Africa ─────────────────────────────────────────────────────
  { code: "ZA", name: "South Africa", currency: "zar", language: "en", stateLabel: "Province", postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Africa/Johannesburg"] },
  { code: "NG", name: "Nigeria", currency: "ngn", language: "en", stateLabel: "State", postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Africa/Lagos"] },
  { code: "EG", name: "Egypt", currency: "egp", language: "ar", stateLabel: "Governorate", postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Africa/Cairo"] },
  { code: "MA", name: "Morocco", currency: "mad", language: "fr", stateLabel: null, postalLabel: "Postal code", hoursFormat: "24h", timezones: ["Africa/Casablanca"] },
  { code: "KE", name: "Kenya", currency: "kes", language: "en", stateLabel: "County", postalLabel: "Postal code", hoursFormat: "12h", timezones: ["Africa/Nairobi"] },

  // ── Fallback ───────────────────────────────────────────────────
  { code: "OTHER", name: "Other / Not listed", currency: "usd", language: "en", stateLabel: "State/Region", postalLabel: "Postal code", hoursFormat: "24h",
    timezones: ["UTC"] },
];

const COUNTRY_BY_CODE: Record<string, CountryRegion> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c]),
);

export function regionForCountry(code: string | null | undefined): CountryRegion | null {
  if (!code) return null;
  return COUNTRY_BY_CODE[code.toUpperCase()] ?? null;
}

/** The cascade: country → its default timezone/currency/language + labels.
 *  Falls back to the "OTHER" entry (UTC/usd/en) for unknown codes. */
export function defaultsForCountry(code: string | null | undefined): {
  timezone: string;
  currency: string;
  language: string;
  stateLabel: string | null;
  postalLabel: string;
  hoursFormat: "12h" | "24h";
} {
  const region = regionForCountry(code) ?? COUNTRY_BY_CODE.OTHER;
  return {
    timezone: region.timezones[0],
    currency: region.currency,
    language: region.language,
    stateLabel: region.stateLabel,
    postalLabel: region.postalLabel,
    hoursFormat: region.hoursFormat,
  };
}

/** Validate an IANA timezone string. Uses Intl.supportedValuesOf when
 *  available (Node 18+/modern browsers); falls back to constructing a
 *  formatter (throws on invalid zone) so we never accept garbage. */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    const sv = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof sv === "function") {
      return sv("timeZone").includes(tz);
    }
  } catch {
    /* fall through to the formatter probe */
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** All IANA timezones (for a free-form "advanced" picker fallback). */
export function allTimezones(): string[] {
  try {
    const sv = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (typeof sv === "function") {
      return sv("timeZone");
    }
  } catch {
    /* noop */
  }
  // Minimal fallback — the per-country list covers the common cases.
  return COUNTRIES.flatMap((c) => c.timezones);
}

/** Comprehensive currency list for the admin picker. Symbols are
 *  illustrative; Intl.NumberFormat renders the canonical symbol per
 *  locale at display time. Codes stored lowercase on the restaurant. */
export const CURRENCIES: Array<{ code: string; label: string; symbol: string }> = [
  { code: "usd", label: "US Dollar", symbol: "$" },
  { code: "eur", label: "Euro", symbol: "€" },
  { code: "gbp", label: "British Pound", symbol: "£" },
  { code: "cad", label: "Canadian Dollar", symbol: "$" },
  { code: "aud", label: "Australian Dollar", symbol: "$" },
  { code: "nzd", label: "New Zealand Dollar", symbol: "$" },
  { code: "chf", label: "Swiss Franc", symbol: "CHF" },
  { code: "sek", label: "Swedish Krona", symbol: "kr" },
  { code: "nok", label: "Norwegian Krone", symbol: "kr" },
  { code: "dkk", label: "Danish Krone", symbol: "kr" },
  { code: "pln", label: "Polish Złoty", symbol: "zł" },
  { code: "czk", label: "Czech Koruna", symbol: "Kč" },
  { code: "huf", label: "Hungarian Forint", symbol: "Ft" },
  { code: "ron", label: "Romanian Leu", symbol: "lei" },
  { code: "bgn", label: "Bulgarian Lev", symbol: "лв" },
  { code: "rsd", label: "Serbian Dinar", symbol: "дин" },
  { code: "uah", label: "Ukrainian Hryvnia", symbol: "₴" },
  { code: "rub", label: "Russian Ruble", symbol: "₽" },
  { code: "try", label: "Turkish Lira", symbol: "₺" },
  { code: "isk", label: "Icelandic Króna", symbol: "kr" },
  { code: "aed", label: "UAE Dirham", symbol: "د.إ" },
  { code: "sar", label: "Saudi Riyal", symbol: "﷼" },
  { code: "qar", label: "Qatari Riyal", symbol: "﷼" },
  { code: "ils", label: "Israeli New Shekel", symbol: "₪" },
  { code: "jpy", label: "Japanese Yen", symbol: "¥" },
  { code: "krw", label: "South Korean Won", symbol: "₩" },
  { code: "cny", label: "Chinese Yuan", symbol: "¥" },
  { code: "hkd", label: "Hong Kong Dollar", symbol: "$" },
  { code: "twd", label: "New Taiwan Dollar", symbol: "NT$" },
  { code: "sgd", label: "Singapore Dollar", symbol: "$" },
  { code: "myr", label: "Malaysian Ringgit", symbol: "RM" },
  { code: "idr", label: "Indonesian Rupiah", symbol: "Rp" },
  { code: "thb", label: "Thai Baht", symbol: "฿" },
  { code: "vnd", label: "Vietnamese Đồng", symbol: "₫" },
  { code: "php", label: "Philippine Peso", symbol: "₱" },
  { code: "inr", label: "Indian Rupee", symbol: "₹" },
  { code: "mxn", label: "Mexican Peso", symbol: "$" },
  { code: "brl", label: "Brazilian Real", symbol: "R$" },
  { code: "ars", label: "Argentine Peso", symbol: "$" },
  { code: "clp", label: "Chilean Peso", symbol: "$" },
  { code: "cop", label: "Colombian Peso", symbol: "$" },
  { code: "pen", label: "Peruvian Sol", symbol: "S/" },
  { code: "zar", label: "South African Rand", symbol: "R" },
  { code: "ngn", label: "Nigerian Naira", symbol: "₦" },
  { code: "egp", label: "Egyptian Pound", symbol: "£" },
  { code: "mad", label: "Moroccan Dirham", symbol: "د.م." },
  { code: "kes", label: "Kenyan Shilling", symbol: "KSh" },
];

const CURRENCY_CODES = new Set(CURRENCIES.map((c) => c.code));

export function isValidCurrency(code: string | null | undefined): boolean {
  return !!code && CURRENCY_CODES.has(code.toLowerCase());
}
