/**
 * Selectable columns for the Orders List export, mirroring GloriaFood's
 * "Select fields" grid. Shared by the export form and the export route so the
 * two can never disagree about ids, order, or defaults.
 *
 * Headers are English on purpose — the existing admin report exports do the
 * same (a spreadsheet is usually handed to an accountant, and mixed-locale
 * headers break downstream formulas).
 */
export type ExportFieldId =
  | "restaurantId" | "restaurantName" | "restaurantAddress" | "companyName"
  | "orderId" | "channel" | "type" | "outcome"
  | "customerName" | "customerEmail" | "customerPhone"
  | "subtotal" | "discount" | "deliveryFee" | "tax" | "tip" | "total" | "currency"
  | "paymentMethod" | "paymentStatus"
  | "placedAt" | "confirmedAt" | "fulfilledAt"
  | "guests" | "deposit" | "preOrder" | "notes";

export type ExportField = { id: ExportFieldId; label: string; default: boolean };

export const EXPORT_FIELDS: ExportField[] = [
  { id: "restaurantId",      label: "Restaurant ID",      default: true },
  { id: "restaurantName",    label: "Restaurant Name",    default: true },
  { id: "restaurantAddress", label: "Restaurant Address", default: true },
  { id: "companyName",       label: "Company Name",       default: true },
  { id: "orderId",           label: "Order ID",           default: true },
  { id: "channel",           label: "Channel",            default: true },
  { id: "type",              label: "Type",               default: true },
  { id: "outcome",           label: "Outcome",            default: true },
  { id: "customerName",      label: "Customer",           default: true },
  { id: "customerEmail",     label: "Email",              default: true },
  { id: "customerPhone",     label: "Phone",              default: true },
  { id: "subtotal",          label: "Subtotal",           default: true },
  { id: "discount",          label: "Discount",           default: true },
  { id: "deliveryFee",       label: "Delivery fee",       default: true },
  { id: "tax",               label: "Total taxes",        default: true },
  { id: "tip",               label: "Tip",                default: true },
  { id: "total",             label: "Total",              default: true },
  { id: "currency",          label: "Currency",           default: true },
  { id: "paymentMethod",     label: "Payment method",     default: true },
  { id: "paymentStatus",     label: "Payment status",     default: true },
  { id: "placedAt",          label: "Placed time",        default: true },
  { id: "confirmedAt",       label: "Confirmed time",     default: true },
  { id: "fulfilledAt",       label: "Fulfilment time",    default: true },
  { id: "guests",            label: "Guests",             default: true },
  { id: "deposit",           label: "Deposit",            default: false },
  { id: "preOrder",          label: "Pre-order total",    default: false },
  { id: "notes",             label: "Comments",           default: false },
];

export const DEFAULT_EXPORT_FIELDS: ExportFieldId[] = EXPORT_FIELDS.filter((f) => f.default).map((f) => f.id);

/** Parse the `fields` query param (comma-separated) back to a validated,
 *  canonically-ordered list. Unknown ids are dropped; empty → the defaults. */
export function parseExportFields(raw: string | null | undefined): ExportFieldId[] {
  if (!raw) return DEFAULT_EXPORT_FIELDS;
  const wanted = new Set(raw.split(",").map((s) => s.trim()));
  const picked = EXPORT_FIELDS.filter((f) => wanted.has(f.id)).map((f) => f.id);
  return picked.length > 0 ? picked : DEFAULT_EXPORT_FIELDS;
}
