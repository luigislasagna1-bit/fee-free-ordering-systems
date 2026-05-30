/**
 * Phone-number normaliser. Strips formatting then ensures the result
 * is E.164-shaped (leading "+", 8–15 digits). Returns null when the
 * input can't be coerced into a valid number — callers should treat
 * that as "skip the SMS / don't dispatch."
 *
 * Heuristics:
 *  • Already starts with "+"? Trust the country code.
 *  • 11-digit number starting with "1"? Treat as +1xxxxxxxxxx (NANP).
 *  • 10-digit number? Default-assume NANP (+1) — most of our launch
 *    market is CA/US. Owners outside that need to either store
 *    customer phones with explicit "+44…" prefix or wait for the
 *    per-restaurant default-country feature.
 */
export function sanitizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/[^\d]/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  // Anything else: bail. We don't want to send to a malformed number.
  return null;
}
