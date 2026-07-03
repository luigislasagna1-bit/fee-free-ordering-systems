/**
 * EU VIES VAT-number validation (Fabrizio cmr1ty0lc follow-up, 2026-07-03).
 *
 * Fee Free Ordering Inc. is a CANADIAN company with no EU VAT registration,
 * so the launch tax policy for EU restaurants (Luigi, "Option A") is:
 *
 *   - EU business with a VIES-validated VAT number → 0% VAT, invoice carries
 *     the Article 44 / Directive 2006/112/EC reverse-charge note (exactly the
 *     GloriaFood/Oracle model Fabrizio's screenshots show).
 *   - EU restaurant WITHOUT a VIES-validated number → cannot start a PAID
 *     subscription (stays on the free plan) until they add one — selling to
 *     them as consumers would require an EU (non-Union OSS) VAT registration
 *     we deliberately don't have yet at zero sales.
 *
 * Validation uses the EU's official VIES REST service (same system as
 * https://ec.europa.eu/taxation_customs/vies). VIES has documented downtime
 * windows per member state, so every check FAILS SOFT: an unreachable service
 * returns { checked: false } and callers keep the previous verdict instead of
 * wiping it.
 */

/** EU-27 country codes as VIES expects them. NOTE: VIES uses "EL" for Greece
 *  (ISO says "GR") and accepts "XI" for Northern Ireland post-Brexit. */
const VIES_MS = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI",
  "FR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "XI",
]);

/** ISO alpha-2 → VIES member-state code (only Greece differs). */
export function viesCountryCode(isoCountry: string | null | undefined): string | null {
  const cc = (isoCountry ?? "").trim().toUpperCase();
  if (!cc) return null;
  const mapped = cc === "GR" ? "EL" : cc;
  return VIES_MS.has(mapped) ? mapped : null;
}

/** True when the restaurant's country is in the EU VAT area (VIES applies). */
export function isEuViesCountry(isoCountry: string | null | undefined): boolean {
  return viesCountryCode(isoCountry) !== null;
}

/**
 * Parse a FULL VAT number that carries its own country prefix
 * ("IT01234567890", "EL999999999", "gr 123…") into a VIES member-state code +
 * bare number. Used for reseller VAT numbers, which are stored as one string
 * with no separate country field. Returns null when the prefix isn't an EU
 * VIES country (e.g. a Canadian GST number) — "can't check", not "invalid".
 */
export function parseViesVatNumber(fullVat: string | null | undefined): { ms: string; number: string } | null {
  const raw = (fullVat ?? "").replace(/[\s.\-]/g, "").toUpperCase();
  if (raw.length < 4) return null;
  const ms = viesCountryCode(raw.slice(0, 2)); // accepts both GR and EL for Greece
  if (!ms) return null;
  return { ms, number: raw.slice(2) };
}

export type ViesResult =
  | { checked: true; valid: boolean; name?: string | null; address?: string | null }
  | { checked: false; reason: string };

/**
 * Validate a VAT number against VIES. `vatNumber` may include the country
 * prefix ("IT03982530135"), spaces, or dots — all normalized away.
 * Never throws; network/service failures return { checked: false }.
 */
export async function checkViesVat(isoCountry: string, vatNumber: string): Promise<ViesResult> {
  const ms = viesCountryCode(isoCountry);
  if (!ms) return { checked: false, reason: "not_eu" };
  let num = (vatNumber ?? "").replace(/[\s.\-]/g, "").toUpperCase();
  if (num.startsWith(ms)) num = num.slice(ms.length);
  else if (/^[A-Z]{2}/.test(num) && num.slice(0, 2) === (isoCountry ?? "").trim().toUpperCase()) num = num.slice(2);
  if (!num || !/^[A-Z0-9+*]{2,15}$/.test(num)) return { checked: true, valid: false };

  try {
    const res = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${ms}/vat/${encodeURIComponent(num)}`,
      { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" },
    );
    if (!res.ok) return { checked: false, reason: `vies_http_${res.status}` };
    const data = (await res.json()) as { isValid?: boolean; valid?: boolean; name?: string; address?: string; userError?: string };
    // The service reports its own availability problems via userError codes
    // (MS_UNAVAILABLE, TIMEOUT, ...) — those are "couldn't check", not "invalid".
    const err = (data.userError ?? "").toUpperCase();
    if (err && err !== "VALID" && err !== "INVALID") return { checked: false, reason: err };
    const valid = data.isValid ?? data.valid;
    if (typeof valid !== "boolean") return { checked: false, reason: "vies_bad_response" };
    return { checked: true, valid, name: data.name ?? null, address: data.address ?? null };
  } catch (e) {
    return { checked: false, reason: e instanceof Error ? e.name : "vies_error" };
  }
}

/**
 * Option-A purchase gate: may this restaurant start a PAID subscription?
 * Non-EU → always yes. EU → only with a VIES-validated VAT number on file.
 * Returns null when allowed, else a machine code the checkout routes map to
 * a clear error. Reads the billing profile; one indexed point query.
 */
export async function euVatSubscriptionBlock(restaurantId: string): Promise<null | { code: "eu_vat_required"; country: string }> {
  const prisma = (await import("@/lib/db")).default;
  const [bp, r] = await Promise.all([
    prisma.restaurantBillingProfile.findUnique({
      where: { restaurantId },
      select: { country: true, taxId: true, taxIdViesValid: true },
    }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { country: true } }),
  ]);
  const country = (bp?.country || r?.country || "").trim().toUpperCase();
  if (!isEuViesCountry(country)) return null;
  if (bp?.taxId && bp.taxIdViesValid === true) return null;
  return { code: "eu_vat_required", country };
}
