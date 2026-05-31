import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format a number as a currency string. Accepts an optional ISO 4217
 * code (e.g. "USD", "EUR", "CAD"). When omitted defaults to USD so
 * legacy call sites that don't have a restaurant in scope (e.g.
 * pure marketing pages) keep their previous behaviour.
 *
 * The locale is chosen from the currency itself so the right symbol
 * + thousand/decimal separators appear: EUR → de-DE → "1.234,56 €",
 * GBP → en-GB → "£1,234.56", USD → en-US → "$1,234.56", etc. If you
 * need a specific locale (e.g. French Euros), pass it explicitly.
 */
export function formatCurrency(amount: number, currency: string = "USD", locale?: string): string {
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

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
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
