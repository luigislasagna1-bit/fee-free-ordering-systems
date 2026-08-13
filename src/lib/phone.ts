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
/**
 * THE identity key for a phone number: bare digits, with a NANP country code
 * dropped so "+1 416 833-8405", "(416) 833-8405" and "4168338405" are all one
 * person. Returns null when there aren't enough digits to identify anyone.
 *
 * Deliberately NOT `sanitizePhone` (which produces E.164 for dialling): the
 * stored columns are bare local digits, so an E.164 key would match nothing.
 * Having two shapes and no shared key is what let the same bug ship three
 * times — a returning caller unrecognised, a quote and a charge priced as two
 * different customers, and a duplicate Customer row (ORD-264127463, 2026-08-13).
 *
 * Non-NANP numbers keep their country code: there is no safe way to strip one
 * without knowing the plan, and a wrong strip merges two different people.
 */
export function phoneDigitsKey(input: string | null | undefined): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

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
