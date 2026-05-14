// ─── Types ────────────────────────────────────────────────────────────────────

export type CustomerSectionType =
  | "store_name" | "store_info"
  | "order_info" | "customer_info" | "items" | "modifiers"
  | "totals" | "payment" | "notes"
  | "thank_you" | "footer";

export type KitchenSectionType =
  | "k_title" | "k_order_type" | "k_order_number"
  | "k_datetime" | "k_customer" | "k_items" | "k_modifiers"
  | "k_notes" | "k_prep";

// `modifiers` (customer) and `k_modifiers` (kitchen) are STYLE-ONLY sections.
// They appear in the template editor so the user can independently configure
// how modifier lines (e.g. "+ Extra Cheese") are formatted, but they do NOT
// render as their own block in the receipt — the items renderer looks up
// the modifiers section by type and applies its style to each modifier line
// inside its parent item.  Setting `enabled: false` on the modifiers section
// suppresses modifier lines entirely.

export type SectionType = CustomerSectionType | KitchenSectionType;

export interface SectionStyle {
  fontSize: number;        // px
  bold: boolean;
  align: "left" | "center" | "right";
  lineHeight: number;      // multiplier
  color: string;           // hex
  bgColor: string;         // hex or "transparent"
  highlight: boolean;      // black bg / white text (inverted)
  paddingTop: number;      // px
  paddingBottom: number;   // px
  dividerAbove: boolean;
  dividerBelow: boolean;
}

export interface Section {
  id: string;
  type: SectionType;
  label: string;
  enabled: boolean;
  style: SectionStyle;
}

export interface CustomerConfig {
  version: 2;
  receiptType: "customer";
  thankYouMessage: string;
  footerText: string;
  sections: Section[];
}

export interface KitchenConfig {
  version: 2;
  receiptType: "kitchen";
  sections: Section[];
}

export type ReceiptConfig = CustomerConfig | KitchenConfig;

// ─── Style presets ────────────────────────────────────────────────────────────

const base: SectionStyle = {
  fontSize: 12, bold: false, align: "left", lineHeight: 1.45,
  color: "#000000", bgColor: "transparent", highlight: false,
  paddingTop: 3, paddingBottom: 3, dividerAbove: false, dividerBelow: false,
};
const c  = { ...base, align: "center" as const };
const bl = { ...base, bold: true };
const bc = { ...base, bold: true, align: "center" as const };

// ─── Default customer config ──────────────────────────────────────────────────

export const DEFAULT_CUSTOMER_CONFIG: CustomerConfig = {
  version: 2,
  receiptType: "customer",
  thankYouMessage: "Thank you for your order!",
  footerText: "We appreciate your business.",
  sections: [
    { id: "store_name",    type: "store_name",    label: "Store Name",          enabled: true,  style: { ...bc, fontSize: 18, paddingTop: 10, paddingBottom: 2 } },
    { id: "store_info",    type: "store_info",    label: "Store Address & Phone", enabled: true, style: { ...c,  fontSize: 11, paddingBottom: 8 } },
    { id: "order_info",    type: "order_info",    label: "Order Info",          enabled: true,  style: { ...base, dividerAbove: true, dividerBelow: true, paddingTop: 6, paddingBottom: 6 } },
    { id: "customer_info", type: "customer_info", label: "Customer Info",       enabled: true,  style: { ...base, paddingTop: 5, paddingBottom: 5 } },
    { id: "items",         type: "items",         label: "Items List",          enabled: true,  style: { ...bl,  fontSize: 13, dividerAbove: true, paddingTop: 7, paddingBottom: 4 } },
    { id: "modifiers",     type: "modifiers",     label: "Modifiers",           enabled: true,  style: { ...base, fontSize: 11, paddingTop: 0, paddingBottom: 0 } },
    { id: "totals",        type: "totals",        label: "Totals",              enabled: true,  style: { ...base, dividerAbove: true, paddingTop: 6, paddingBottom: 6 } },
    { id: "payment",       type: "payment",       label: "Payment Method",      enabled: true,  style: { ...base, paddingTop: 2, paddingBottom: 4 } },
    { id: "notes",         type: "notes",         label: "Order Notes",         enabled: true,  style: { ...base, fontSize: 11, paddingTop: 4, paddingBottom: 4 } },
    { id: "thank_you",     type: "thank_you",     label: "Thank You Message",   enabled: true,  style: { ...c,   fontSize: 13, dividerAbove: true, paddingTop: 10, paddingBottom: 4 } },
    { id: "footer",        type: "footer",        label: "Footer Text",         enabled: true,  style: { ...c,   fontSize: 11, paddingBottom: 10 } },
  ],
};

// ─── Default kitchen config ───────────────────────────────────────────────────

export const DEFAULT_KITCHEN_CONFIG: KitchenConfig = {
  version: 2,
  receiptType: "kitchen",
  sections: [
    { id: "k_title",        type: "k_title",       label: "Kitchen Header",      enabled: true, style: { ...bc, fontSize: 15, paddingTop: 8, paddingBottom: 6, dividerBelow: true } },
    { id: "k_order_type",   type: "k_order_type",  label: "Order Type Badge",    enabled: true, style: { ...bc, fontSize: 22, bold: true, highlight: true, paddingTop: 10, paddingBottom: 10 } },
    { id: "k_order_number", type: "k_order_number", label: "Order Number",       enabled: true, style: { ...bc, fontSize: 32, bold: true, paddingTop: 6, paddingBottom: 6 } },
    { id: "k_datetime",     type: "k_datetime",    label: "Date & Time",         enabled: true, style: { ...c,  fontSize: 11, paddingBottom: 6, dividerBelow: true } },
    { id: "k_customer",     type: "k_customer",    label: "Customer Name",       enabled: true, style: { ...base, fontSize: 14, bold: true, paddingTop: 5, paddingBottom: 5 } },
    { id: "k_items",        type: "k_items",       label: "Items (no prices)",   enabled: true, style: { ...bl,  fontSize: 17, dividerAbove: true, paddingTop: 8, paddingBottom: 4 } },
    { id: "k_modifiers",    type: "k_modifiers",   label: "Modifiers",           enabled: true, style: { ...base, fontSize: 14, paddingTop: 0, paddingBottom: 0 } },
    { id: "k_notes",        type: "k_notes",       label: "Order Notes",         enabled: true, style: { ...base, fontSize: 14, paddingTop: 6, paddingBottom: 6 } },
    { id: "k_prep",         type: "k_prep",        label: "Prep Time Line",      enabled: true, style: { ...base, fontSize: 13, dividerAbove: true, paddingTop: 6, paddingBottom: 10 } },
  ],
};

// ─── Config parser (handles old + new format) ─────────────────────────────────

export function parseReceiptConfig(raw: string | null | undefined, receiptType: "customer"): CustomerConfig;
export function parseReceiptConfig(raw: string | null | undefined, receiptType: "kitchen"): KitchenConfig;
export function parseReceiptConfig(raw: string | null | undefined, receiptType: "customer" | "kitchen"): ReceiptConfig {
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version === 2 && parsed.receiptType === receiptType) {
        // Strip legacy section types that have been removed from the schema:
        //  - "logo"     : image printing not supported on this thermal hardware.
        //  - "qr_code"  : removed because the QR rendering wasn't reliable.
        parsed.sections = (parsed.sections ?? []).filter(
          (s: any) => s.type !== "logo" && s.type !== "qr_code",
        );
        // Drop the legacy qrUrl field on customer configs (no-op for kitchen).
        if (parsed.qrUrl !== undefined) delete parsed.qrUrl;

        // Back-fill any sections present in the current default but absent from the
        // saved config (e.g. modifiers added after the user first saved).
        const defaults = receiptType === "customer" ? DEFAULT_CUSTOMER_CONFIG : DEFAULT_KITCHEN_CONFIG;
        const savedIds = new Set((parsed.sections as any[]).map((s: any) => s.id));
        for (const def of defaults.sections) {
          if (!savedIds.has(def.id)) {
            parsed.sections.push(def);
          }
        }

        return parsed as ReceiptConfig;
      }
    } catch {}
  }
  return receiptType === "customer"
    ? { ...DEFAULT_CUSTOMER_CONFIG }
    : { ...DEFAULT_KITCHEN_CONFIG };
}
