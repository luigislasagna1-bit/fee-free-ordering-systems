/**
 * Country-specific fiscal/tax configuration for the billing profile (Luigi
 * 2026-06-13). The fiscal fields a restaurant must fill in differ by country —
 * a Canadian restaurant needs a GST/HST number, an Italian one a Partita IVA
 * plus the SDI code + PEC for e-invoicing, an EU one a VAT number, a US one an
 * EIN. This drives which fields show, their labels, the Stripe tax_id type, and
 * placeholders.
 *
 * The tax-id LABELS are each country's own fiscal term (Partita IVA, GST/HST,
 * USt-IdNr., VAT, EIN, ABN …). Those are proper nouns — the same in every UI
 * language — so they are NOT translated. Country NAMES in the dropdown come from
 * Intl.DisplayNames in the user's locale, so they need no translation either.
 * Generic surrounding labels keep using the existing admin.billing i18n keys.
 */

export type FiscalConfig = {
  /** Stripe `tax_id` type to register (empty ⇒ generic; show the manual picker). */
  taxIdType: string;
  /** The country's own name for its tax id — shown verbatim as the field label. */
  taxIdLabel: string;
  /** Compact label for invoices / tight spaces. */
  taxIdShort: string;
  /** Example value to guide the owner. */
  taxIdPlaceholder: string;
  /** Italy-only: show the SDI recipient code + PEC certified-email fields. */
  showSdiPec: boolean;
};

const GENERIC: FiscalConfig = {
  taxIdType: "",
  taxIdLabel: "Tax ID",
  taxIdShort: "Tax ID",
  taxIdPlaceholder: "",
  showSdiPec: false,
};

// EU member states all use Stripe's `eu_vat`. Most show a generic "VAT number";
// the big markets get their native term. Italy additionally shows SDI + PEC.
const EU_VAT = (label: string, short: string, placeholder: string, sdiPec = false): FiscalConfig => ({
  taxIdType: "eu_vat", taxIdLabel: label, taxIdShort: short, taxIdPlaceholder: placeholder, showSdiPec: sdiPec,
});

/** ISO-3166 alpha-2 → fiscal config. Anything not listed falls back to GENERIC. */
const COUNTRIES: Record<string, FiscalConfig> = {
  // ── Non-EU, country-specific schemes ───────────────────────────────────────
  CA: { taxIdType: "ca_gst_hst", taxIdLabel: "GST/HST number", taxIdShort: "GST/HST", taxIdPlaceholder: "123456789RT0001", showSdiPec: false },
  US: { taxIdType: "us_ein", taxIdLabel: "EIN (Tax ID)", taxIdShort: "EIN", taxIdPlaceholder: "12-3456789", showSdiPec: false },
  GB: { taxIdType: "gb_vat", taxIdLabel: "VAT number", taxIdShort: "VAT", taxIdPlaceholder: "GB123456789", showSdiPec: false },
  AU: { taxIdType: "au_abn", taxIdLabel: "ABN", taxIdShort: "ABN", taxIdPlaceholder: "12345678912", showSdiPec: false },
  NZ: { taxIdType: "nz_gst", taxIdLabel: "GST number", taxIdShort: "GST", taxIdPlaceholder: "123456789", showSdiPec: false },
  CH: { taxIdType: "ch_vat", taxIdLabel: "VAT (MWST/TVA)", taxIdShort: "VAT", taxIdPlaceholder: "CHE-123.456.789 MWST", showSdiPec: false },
  NO: { taxIdType: "no_vat", taxIdLabel: "VAT (MVA)", taxIdShort: "VAT", taxIdPlaceholder: "123456789MVA", showSdiPec: false },

  // ── EU member states (eu_vat) ──────────────────────────────────────────────
  IT: EU_VAT("Partita IVA", "P.IVA", "IT01234567890", /* sdiPec */ true),
  DE: EU_VAT("USt-IdNr.", "USt-IdNr.", "DE123456789"),
  FR: EU_VAT("Numéro de TVA", "TVA", "FR12345678901"),
  ES: EU_VAT("NIF / CIF", "NIF", "ESX1234567X"),
  NL: EU_VAT("BTW-nummer", "BTW", "NL123456789B01"),
  PT: EU_VAT("NIF", "NIF", "PT123456789"),
  BE: EU_VAT("BTW / TVA", "BTW", "BE0123456789"),
  AT: EU_VAT("UID / ATU", "UID", "ATU12345678"),
  IE: EU_VAT("VAT number", "VAT", "IE1234567X"),
  PL: EU_VAT("NIP", "NIP", "PL1234567890"),
  SE: EU_VAT("Momsnr.", "Moms", "SE123456789012"),
  DK: EU_VAT("CVR / moms", "CVR", "DK12345678"),
  FI: EU_VAT("ALV-numero", "ALV", "FI12345678"),
  CZ: EU_VAT("DIČ", "DIČ", "CZ12345678"),
  SK: EU_VAT("IČ DPH", "IČ DPH", "SK1234567890"),
  HU: EU_VAT("Közösségi adószám", "VAT", "HU12345678"),
  RO: EU_VAT("Cod TVA", "TVA", "RO1234567890"),
  BG: EU_VAT("ДДС номер", "VAT", "BG123456789"),
  HR: EU_VAT("PDV / OIB", "PDV", "HR12345678901"),
  SI: EU_VAT("ID za DDV", "DDV", "SI12345678"),
  EE: EU_VAT("KMKR number", "KMKR", "EE123456789"),
  LV: EU_VAT("PVN numurs", "PVN", "LV12345678901"),
  LT: EU_VAT("PVM kodas", "PVM", "LT123456789"),
  GR: EU_VAT("ΑΦΜ / VAT", "VAT", "EL123456789"),
  LU: EU_VAT("No. TVA", "TVA", "LU12345678"),
  CY: EU_VAT("VAT number", "VAT", "CY12345678X"),
  MT: EU_VAT("VAT number", "VAT", "MT12345678"),
};

/** ISO codes we expose in the country picker, roughly grouped: the home markets
 *  first, then the rest alphabetically by their localized name at render time. */
export const FISCAL_COUNTRY_CODES: string[] = [
  "CA", "US", "GB", "IT", "DE", "FR", "ES", "NL", "PT", "BE", "AT", "IE", "CH",
  "PL", "SE", "DK", "FI", "NO", "CZ", "SK", "HU", "RO", "BG", "HR", "SI", "EE",
  "LV", "LT", "GR", "LU", "CY", "MT", "AU", "NZ",
];

/** Fiscal config for a country code (case-insensitive). Unknown ⇒ GENERIC, which
 *  shows a plain "Tax ID" + the manual Stripe tax-id-type picker. */
export function getFiscalConfig(country: string | null | undefined): FiscalConfig {
  if (!country) return GENERIC;
  return COUNTRIES[country.toUpperCase()] ?? GENERIC;
}

/** True when the country has an explicit scheme (so we hide the manual type picker). */
export function isKnownFiscalCountry(country: string | null | undefined): boolean {
  return !!country && !!COUNTRIES[country.toUpperCase()];
}
