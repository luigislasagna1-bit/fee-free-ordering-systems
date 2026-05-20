/**
 * Platform tax (the tax WE charge restaurants for our services).
 *
 * Fee Free Ordering is a Canadian-registered platform (HST registered
 * in Ontario). CRA rules for how much tax we collect when invoicing a
 * restaurant for add-ons / marketplace settlements:
 *
 *   - Restaurant outside Canada (US, anywhere else): 0%. Place of supply
 *     is outside Canada → exempt from GST/HST. We still bill in USD.
 *   - Restaurant inside Canada: charge the destination province's
 *     combined GST + PST/HST rate. The "destination" is the
 *     restaurant's primary address (Restaurant.country / Restaurant.state).
 *
 * All amounts are in USD regardless of the restaurant's location —
 * the tax % is just applied on top of the USD bill.
 *
 * This is SEPARATE from Restaurant.taxRate, which is the tax a
 * restaurant charges its OWN customers on food orders. That number is
 * controlled by the restaurant owner in /admin/service-fees.
 */

export type CanadianProvinceCode =
  | "AB" | "BC" | "MB" | "NB" | "NL"
  | "NS" | "NT" | "NU" | "ON" | "PE"
  | "QC" | "SK" | "YT";

/** Combined GST + PST/HST rates by province (percent). Verified against
 *  CRA published rates 2024. Update annually or when a province adjusts
 *  its tax. Source: canada.ca/en/revenue-agency/services/tax */
const PROVINCE_RATES: Record<CanadianProvinceCode, number> = {
  AB: 5,       // GST only
  BC: 12,      // GST 5% + PST 7%
  MB: 12,      // GST 5% + PST 7% (RST)
  NB: 15,      // HST
  NL: 15,      // HST
  NS: 15,      // HST
  NT: 5,       // GST only (territory)
  NU: 5,       // GST only (territory)
  ON: 13,      // HST
  PE: 15,      // HST
  QC: 14.975,  // GST 5% + QST 9.975%
  SK: 11,      // GST 5% + PST 6%
  YT: 5,       // GST only (territory)
};

/** Match Canada in any reasonable input form: "CA", "CAN", "Canada". */
const CA_COUNTRY_CODES = new Set(["CA", "CAN", "CANADA"]);

/** Province aliases — owners often type "Ontario" or "Ont." instead of "ON".
 *  Map common variants to the canonical 2-letter code we look up by. */
const PROVINCE_ALIASES: Record<string, CanadianProvinceCode> = {
  "ALBERTA": "AB", "ALTA": "AB", "AB": "AB",
  "BRITISH COLUMBIA": "BC", "BC": "BC",
  "MANITOBA": "MB", "MAN": "MB", "MB": "MB",
  "NEW BRUNSWICK": "NB", "NB": "NB",
  "NEWFOUNDLAND": "NL", "NEWFOUNDLAND AND LABRADOR": "NL", "NL": "NL", "NF": "NL",
  "NOVA SCOTIA": "NS", "NS": "NS",
  "NORTHWEST TERRITORIES": "NT", "NT": "NT", "NWT": "NT",
  "NUNAVUT": "NU", "NU": "NU",
  "ONTARIO": "ON", "ONT": "ON", "ON": "ON",
  "PRINCE EDWARD ISLAND": "PE", "PEI": "PE", "PE": "PE",
  "QUEBEC": "QC", "QUÉBEC": "QC", "QUE": "QC", "QC": "QC", "PQ": "QC",
  "SASKATCHEWAN": "SK", "SASK": "SK", "SK": "SK",
  "YUKON": "YT", "YT": "YT",
};

export type PlatformTax = {
  /** Percentage rate, e.g. 13 for Ontario, 0 for US. */
  ratePct: number;
  /** "ON", "AB", etc. when in Canada with a recognized province; null otherwise. */
  province: CanadianProvinceCode | null;
  /** Short human label for invoice lines + UI ("Ontario HST 13%", "Tax-exempt (US)", etc.). */
  label: string;
  /** Coarse category, useful for receipts and Stripe TaxRate display_name. */
  type: "HST" | "GST_PST" | "GST_QST" | "GST" | "none";
};

/** Compute the platform tax for a given restaurant address. Country
 *  may be a 2-letter code, 3-letter code, or full name; state may be
 *  a 2-letter code or full province name. Case-insensitive.
 *
 *  Edge cases:
 *   - Canadian restaurant, unknown / blank province → 0% (under-bill
 *     and audit rather than over-bill on bad data). Operator should fix
 *     the restaurant address in /admin/profile.
 *   - Non-Canada or blank country → 0% with label "Tax-exempt". */
export function getPlatformTax(args: {
  country: string | null | undefined;
  state: string | null | undefined;
}): PlatformTax {
  const country = (args.country ?? "").trim().toUpperCase();
  if (!CA_COUNTRY_CODES.has(country)) {
    return {
      ratePct: 0,
      province: null,
      label: "Tax-exempt (outside Canada)",
      type: "none",
    };
  }

  const provinceRaw = (args.state ?? "").trim().toUpperCase();
  const province = PROVINCE_ALIASES[provinceRaw] ?? null;
  if (!province) {
    return {
      ratePct: 0,
      province: null,
      label: "Tax pending (province not set)",
      type: "none",
    };
  }

  const ratePct = PROVINCE_RATES[province];
  const type = classifyProvince(province);
  return {
    ratePct,
    province,
    label: `${provinceLabel(province)} ${typeLabel(type)} ${ratePct}%`,
    type,
  };
}

function classifyProvince(p: CanadianProvinceCode): PlatformTax["type"] {
  switch (p) {
    case "NB": case "NL": case "NS": case "ON": case "PE":
      return "HST";
    case "QC":
      return "GST_QST";
    case "BC": case "MB": case "SK":
      return "GST_PST";
    case "AB": case "NT": case "NU": case "YT":
      return "GST";
  }
}

function typeLabel(t: PlatformTax["type"]): string {
  switch (t) {
    case "HST": return "HST";
    case "GST_PST": return "GST+PST";
    case "GST_QST": return "GST+QST";
    case "GST": return "GST";
    case "none": return "";
  }
}

function provinceLabel(p: CanadianProvinceCode): string {
  return {
    AB: "Alberta", BC: "British Columbia", MB: "Manitoba",
    NB: "New Brunswick", NL: "Newfoundland", NS: "Nova Scotia",
    NT: "NWT", NU: "Nunavut", ON: "Ontario", PE: "PEI",
    QC: "Quebec", SK: "Saskatchewan", YT: "Yukon",
  }[p];
}

/** Helper used by the settlement engine + Checkout session creation to
 *  generate a stable Stripe TaxRate display_name. Same args → same
 *  display name → same cached Stripe TaxRate object. */
export function stripeTaxRateDisplayName(tax: PlatformTax): string {
  if (tax.ratePct === 0) return "Tax-exempt";
  return `${typeLabel(tax.type)} (${tax.ratePct}%)`;
}
