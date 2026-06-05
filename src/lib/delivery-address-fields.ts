// ─────────────────────────────────────────────────────────────────────────────
// Customizable delivery-address form — single source of truth.
//
// A restaurant can choose WHICH delivery-address fields a customer fills in at
// checkout and which are REQUIRED (GloriaFood-style). The config lives in a
// single JSON column on Restaurant (`deliveryAddressConfig`) so we don't bloat
// the hot Order table with sparse columns. When the column is null the
// DEFAULT_PRESET applies (no regression for existing restaurants).
//
// The customer's filled-in values are stored as a JSON blob on the order
// (`Order.deliveryAddressData`) — again, no per-field columns on a table that
// will hold millions of rows. The flat `deliveryAddress`/`deliveryCity`/
// `deliveryZip` columns are still populated (composed from the structured data)
// so receipts, the kitchen display, and delivery dispatch keep working
// unchanged. Luigi 2026-06-04.
// ─────────────────────────────────────────────────────────────────────────────

export type DeliveryFieldKey =
  | "street"
  | "city"
  | "postcode"
  | "neighbourhood"
  | "building"
  | "intercom"
  | "floor"
  | "apartment"
  | "parking";

export type DeliveryFieldSetting = { show: boolean; required: boolean };
export type DeliveryAddressConfig = Record<DeliveryFieldKey, DeliveryFieldSetting>;

/**
 * Canonical field order + metadata. `labelKey` resolves under the
 * `checkout.addressFields` i18n namespace. `legacy` records which existing
 * CustomerInfo / Order column the field maps onto so back-compat is preserved:
 *   - street     → customerInfo.address  → Order.deliveryAddress (composed)
 *   - city       → customerInfo.city     → Order.deliveryCity
 *   - postcode   → customerInfo.zip      → Order.deliveryZip
 *   - apartment  → customerInfo.unit
 *   - intercom   → customerInfo.buzzer
 *   - the rest are new, structured-only (stored in deliveryAddressData).
 */
export const DELIVERY_ADDRESS_FIELDS: ReadonlyArray<{
  key: DeliveryFieldKey;
  labelKey: string;
  /** street drives the autocomplete + map-pin + zone resolution. */
  isPrimary?: boolean;
}> = [
  { key: "street", labelKey: "street", isPrimary: true },
  { key: "city", labelKey: "city" },
  { key: "postcode", labelKey: "postcode" },
  { key: "neighbourhood", labelKey: "neighbourhood" },
  { key: "building", labelKey: "building" },
  { key: "intercom", labelKey: "intercom" },
  { key: "floor", labelKey: "floor" },
  { key: "apartment", labelKey: "apartment" },
  { key: "parking", labelKey: "parking" },
];

export const DELIVERY_FIELD_KEYS: DeliveryFieldKey[] = DELIVERY_ADDRESS_FIELDS.map((f) => f.key);

/**
 * Default preset — applied whenever a restaurant hasn't customized the form.
 * Mirrors the current hardcoded checkout: Street + Town/City + Postcode shown
 * and required, Apartment shown but optional, everything else hidden.
 */
export const DEFAULT_DELIVERY_ADDRESS_CONFIG: DeliveryAddressConfig = {
  street: { show: true, required: true },
  city: { show: true, required: true },
  postcode: { show: true, required: true },
  neighbourhood: { show: false, required: false },
  building: { show: false, required: false },
  intercom: { show: false, required: false },
  floor: { show: false, required: false },
  apartment: { show: true, required: false },
  parking: { show: false, required: false },
};

/**
 * Coerce a raw JSON value (from Restaurant.deliveryAddressConfig, which is
 * `unknown` off the DB) into a complete, valid config. Missing/garbage fields
 * fall back to the default preset for that field, so the result is ALWAYS a
 * full 9-key config the UI and validators can trust. A hidden field can never
 * be required (a customer can't fill in a field they don't see).
 */
export function resolveDeliveryAddressConfig(raw: unknown): DeliveryAddressConfig {
  const out = {} as DeliveryAddressConfig;
  const rawObj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  for (const key of DELIVERY_FIELD_KEYS) {
    const def = DEFAULT_DELIVERY_ADDRESS_CONFIG[key];
    const entry = rawObj && typeof rawObj[key] === "object" ? (rawObj[key] as Record<string, unknown>) : null;
    if (!entry) {
      out[key] = { ...def };
      continue;
    }
    const show = typeof entry.show === "boolean" ? entry.show : def.show;
    const required = show && (typeof entry.required === "boolean" ? entry.required : def.required);
    out[key] = { show, required };
  }
  return out;
}

/** True when the restaurant has explicitly customized the form (non-null config). */
export function isCustomDeliveryForm(raw: unknown): boolean {
  return !!(raw && typeof raw === "object");
}

export type DeliveryAddressData = Partial<Record<DeliveryFieldKey, string>>;

/**
 * Compose the flat one-line `deliveryAddress` string (for receipts / kitchen /
 * dispatch) from the structured per-field values. City + postcode are stored in
 * their own columns, so we deliberately omit them here to avoid duplication on
 * the receipt line — the receipt renders city/zip separately.
 */
export function composeFlatDeliveryAddress(data: DeliveryAddressData): string {
  const parts: string[] = [];
  if (data.street?.trim()) parts.push(data.street.trim());
  if (data.building?.trim()) parts.push(`Bldg ${data.building.trim()}`);
  if (data.floor?.trim()) parts.push(`Floor ${data.floor.trim()}`);
  if (data.apartment?.trim()) parts.push(`Apt ${data.apartment.trim()}`);
  if (data.intercom?.trim()) parts.push(`Intercom ${data.intercom.trim()}`);
  if (data.neighbourhood?.trim()) parts.push(data.neighbourhood.trim());
  if (data.parking?.trim()) parts.push(`Parking: ${data.parking.trim()}`);
  return parts.join(", ");
}

/**
 * Server-side required-field validation. Returns the key of the first required
 * field that's missing, or null when all required fields are present. Only
 * validates fields that are BOTH shown and required in the resolved config.
 */
export function firstMissingRequiredField(
  config: DeliveryAddressConfig,
  data: DeliveryAddressData,
): DeliveryFieldKey | null {
  for (const key of DELIVERY_FIELD_KEYS) {
    const setting = config[key];
    if (setting.show && setting.required && !data[key]?.trim()) return key;
  }
  return null;
}
