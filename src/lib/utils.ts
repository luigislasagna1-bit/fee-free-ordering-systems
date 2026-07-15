import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * The currency FEE FREE ORDERING itself bills in — subscriptions, add-ons,
 * reseller commissions, payouts, marketplace settlements. Luigi 2026-07-15:
 * "FeeFree bills everyone in USD no matter what." This is deliberately NOT the
 * restaurant's currency: a Euro restaurant still pays its platform invoice in
 * USD. Use this at platform-money call sites so the intent is explicit and
 * greppable — never rely on a silent default.
 */
export const PLATFORM_CURRENCY = "usd";

/**
 * Format a number as a currency string with an ISO 4217 code ("USD", "EUR", …).
 *
 * `currency` is REQUIRED on purpose (Fabrizio cmrkmtva, 2026-07-15). It used to
 * default to "USD", which meant any call site that forgot it silently rendered
 * dollars — a Euro restaurant saw "$" and nobody found out until a reseller
 * complained. Making it required turns that whole class of bug into a compile
 * error. Pass the RESTAURANT's currency for restaurant money, or
 * PLATFORM_CURRENCY for Fee Free's own billing.
 *
 * The locale is chosen from the currency itself so the right symbol
 * + thousand/decimal separators appear: EUR → de-DE → "1.234,56 €",
 * GBP → en-GB → "£1,234.56", USD → en-US → "$1,234.56", etc. If you
 * need a specific locale (e.g. French Euros), pass it explicitly.
 */
export function formatCurrency(amount: number, currency: string, locale?: string): string {
  const code = (currency || "USD").toUpperCase();
  const loc = locale ?? CURRENCY_LOCALE[code] ?? "en-US";
  try {
    return new Intl.NumberFormat(loc, { style: "currency", currency: code }).format(amount);
  } catch {
    // Unknown currency code — fall back to en-US so we never throw at
    // render time. Pricing engine should validate codes on save.
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  }
}

/** Default locale per currency for Intl.NumberFormat — picks the
 *  conventional symbol + separator style customers in each market
 *  expect. Extend as we onboard more regions. */
const CURRENCY_LOCALE: Record<string, string> = {
  USD: "en-US",
  CAD: "en-CA",
  EUR: "de-DE",   // matches typical "1.234,56 €" layout used in Italy, Germany, FR retail
  GBP: "en-GB",
  AUD: "en-AU",
  NZD: "en-NZ",
  CHF: "de-CH",
  SEK: "sv-SE",
  NOK: "nb-NO",
  DKK: "da-DK",
  JPY: "ja-JP",
  MXN: "es-MX",
};

/** Supported currency codes shown in the admin restaurant settings
 *  dropdown. Order matters — most common first. */
export const SUPPORTED_CURRENCIES: Array<{ code: string; label: string; symbol: string }> = [
  { code: "USD", label: "US Dollar",        symbol: "$" },
  { code: "CAD", label: "Canadian Dollar",  symbol: "$" },
  { code: "EUR", label: "Euro",             symbol: "€" },
  { code: "GBP", label: "British Pound",    symbol: "£" },
  { code: "AUD", label: "Australian Dollar", symbol: "$" },
  { code: "NZD", label: "New Zealand Dollar", symbol: "$" },
  { code: "CHF", label: "Swiss Franc",      symbol: "CHF" },
  { code: "SEK", label: "Swedish Krona",    symbol: "kr" },
  { code: "NOK", label: "Norwegian Krone",  symbol: "kr" },
  { code: "DKK", label: "Danish Krone",     symbol: "kr" },
  { code: "JPY", label: "Japanese Yen",     symbol: "¥" },
  { code: "MXN", label: "Mexican Peso",     symbol: "$" },
];

/**
 * The bare currency symbol for an ISO-4217 code (e.g. "EUR" → "€", "USD" → "$").
 * Used for admin input prefixes where we want just the glyph, not a formatted
 * amount. Derives via Intl (handles any code) and falls back to the curated
 * list, then "$". Luigi 2026-06-07 — admin promo wizard hardcoded "$".
 */
export function currencySymbol(code: string | null | undefined): string {
  const cur = String(code ?? "USD").toUpperCase();
  try {
    const sym = new Intl.NumberFormat("en", { style: "currency", currency: cur })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value;
    if (sym) return sym;
  } catch { /* invalid code → fall through */ }
  return SUPPORTED_CURRENCIES.find((c) => c.code === cur)?.symbol ?? "$";
}

/**
 * Render a date/time for display.
 *
 * Backward-compatible: called with just a date it renders in en-US (legacy
 * behaviour). Pass `{ locale, timeZone }` to render in the restaurant's
 * locale and timezone so customer-facing dates (order confirmations,
 * receipts, kitchen) read correctly worldwide instead of in the server's
 * UTC / the browser's en-US.
 */
export function formatDate(
  date: Date | string,
  opts?: { locale?: string; timeZone?: string },
): string {
  return new Intl.DateTimeFormat(opts?.locale ?? "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(opts?.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(new Date(date));
}

/**
 * Capitalize the first letter of each word in a person's name for DISPLAY
 * (e.g. "fabrizio pisu" → "Fabrizio Pisu"), leaving existing inner capitals
 * alone ("McMaster" stays "McMaster"). Display-only — the raw value is still
 * stored as typed. Mirrors the kitchen order-tile name rendering so table
 * reservation names read the same as order names (Fabrizio cmrj7jivw).
 */
export function capitalizeName(s: string | null | undefined): string {
  return String(s ?? "").replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateOrderNumber(): string {
  const now = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `ORD-${now.toString().slice(-6)}${random.toString().padStart(3, "0")}`;
}

export const ORDER_STATUS = {
  pending: { label: "Pending", color: "yellow" },
  accepted: { label: "Accepted", color: "blue" },
  preparing: { label: "Preparing", color: "orange" },
  ready: { label: "Ready", color: "green" },
  completed: { label: "Completed", color: "gray" },
  rejected: { label: "Rejected", color: "red" },
  cancelled: { label: "Cancelled", color: "red" },
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS;
