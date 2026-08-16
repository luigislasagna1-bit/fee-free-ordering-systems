// ─── Types ────────────────────────────────────────────────────────────────────

import defaultReceiptConfig from "./default-receipt-config.json";

export type CustomerSectionType =
  /** Restaurant logo at the top of the customer receipt. Renders ONLY when
   *  Restaurant.receiptLogoUrl is set (skipped otherwise, so the section can
   *  stay enabled by default). Named "store_logo" — NOT the legacy "logo"
   *  type, which parseReceiptConfig still strips (the old ESC/POS image
   *  attempt failed on this hardware). The new path renders the image into
   *  the StarXpand Android bitmap instead, plus HTML preview + email.
   *  Luigi 2026-06-11. */
  | "store_logo"
  | "store_name" | "store_info"
  /** Reserve-then-order block — renders ONLY when the order is linked to a
   *  table booking. Shows the "TABLE RESERVATION + PRE-ORDER" flag, party size
   *  and booking date/time. Its own section so restaurants can toggle / style /
   *  reposition it. Empty (skipped) for normal orders. Luigi 2026-06-09. */
  | "reservation"
  /** ASAP vs scheduled timing line — "Order for NOW: HH:MM" or "Order for
   *  LATER: <date/time>". Its own section so it can be toggled / styled /
   *  repositioned. Skipped for reservations (their time is in the reservation
   *  section). Luigi 2026-06-09. */
  | "timing"
  /** Nabil AI phone-order banner — "PHONE ORDER" + the payment status ("NOT
   *  PAID - $34.50 DUE ON PICKUP" / "PAID"). Renders ONLY when the order came
   *  in by phone (Order.channel === "voice"); skipped entirely for web orders,
   *  like the reservation block. Its own section so it can be toggled / styled
   *  / repositioned. Luigi 2026-08-16. */
  | "phone_order"
  | "order_info" | "customer_info" | "items" | "modifiers"
  /** Applied-promotions box — renders only when the order has any
   *  promo in its `appliedPromos` snapshot. Shows each promo by name
   *  + savings, framed by divider lines. Restaurants can disable the
   *  whole box by toggling enabled=false. */
  | "promos"
  | "totals" | "payment" | "notes"
  | "thank_you" | "footer";

export type KitchenSectionType =
  /** Kitchen-side Nabil AI phone-order banner — see CustomerSectionType
   *  "phone_order". First section of the default PHONE template so staff read
   *  "PHONE ORDER / NOT PAID - $X DUE ON PICKUP" before anything else. */
  | "k_phone_order"
  | "k_title" | "k_order_type" | "k_order_number"
  /** Kitchen reserve-then-order block — see CustomerSectionType "reservation".
   *  Renders the booking flag + party + time, only for pre-orders. */
  | "k_reservation"
  /** Kitchen ASAP-vs-scheduled timing line — see CustomerSectionType "timing". */
  | "k_timing"
  | "k_datetime" | "k_customer" | "k_items" | "k_modifiers"
  /** Kitchen-side applied-promotions box. Restaurants that don't want
   *  to clutter kitchen tickets with discount info can disable it. */
  | "k_promos"
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
  /** GloriaFood-style section box: a thin border around the whole section with
   *  an inverse (black) header strip as the first line (the section's boxTitle,
   *  falling back to its label). Default false → renders exactly as before, so
   *  existing saved templates are untouched. Luigi 2026-06-13. */
  boxed: boolean;
}

export interface Section {
  id: string;
  type: SectionType;
  label: string;
  enabled: boolean;
  style: SectionStyle;
  /** Header text shown in the inverse strip when style.boxed is on. Free text
   *  (like thankYouMessage / footerText — the restaurant's own wording, not
   *  translated). Empty → falls back to the section label. */
  boxTitle?: string;
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

/**
 * The PHONE ORDER receipt — a separate layout for orders that came in through
 * Nabil AI (Order.channel === "voice"). It is a kitchen-style ticket (same
 * `k_*` section types, no prices) that prints INSTEAD of the kitchen receipt
 * for a phone order's kitchen copies, so a restaurant can lay phone tickets
 * out differently from web tickets. Its default puts the `k_phone_order`
 * banner first: "PHONE ORDER" + "NOT PAID - $X DUE ON PICKUP" / "PAID".
 * Customer copies of a phone order keep using the customer template, which
 * carries its own conditional `phone_order` banner. Luigi 2026-08-16.
 */
export interface PhoneConfig {
  version: 2;
  receiptType: "phone";
  sections: Section[];
}

export type ReceiptConfig = CustomerConfig | KitchenConfig | PhoneConfig;

/** Every template kind a restaurant can save (ReceiptTemplate.type). */
export type ReceiptTemplateType = ReceiptConfig["receiptType"];

/**
 * The sales channel value that marks a Nabil AI phone order. Stamped on
 * Order.channel by /api/orders when the voice service places the order (see
 * the `x-internal-key` branch there). The receipt renderers key the phone
 * banner + the phone template selection on this — one constant so a rename
 * can't drift between the three renderers and the two print paths.
 */
export const PHONE_ORDER_CHANNEL = "voice";

/** True when the order was placed by phone through Nabil AI. */
export function isPhoneOrderChannel(channel: string | null | undefined): boolean {
  return channel === PHONE_ORDER_CHANNEL;
}

// ─── Default templates ─────────────────────────────────────────────────────────
//
// Platform default receipt templates — used for BRAND-NEW accounts (no saved
// template yet, via parseReceiptConfig below) and any "reset to default" action.
// Captured from info@luigislasagna.com's live, finalized templates (including the
// GloriaFood section boxes) by scripts/capture-receipt-defaults.ts → written to
// ./default-receipt-config.json. To refresh after Luigi re-styles his store,
// re-run that script + regenerate the JSON. Luigi 2026-06-13.
//
// The section SETS still cover every known section type, so parseReceiptConfig's
// back-fill stays a no-op for EXISTING saved templates (every id already present)
// — only new accounts + resets adopt these styles. Cast through `unknown` because
// importing JSON widens the string-literal fields (align, version, …).

export const DEFAULT_CUSTOMER_CONFIG = defaultReceiptConfig.customer as unknown as CustomerConfig;
export const DEFAULT_KITCHEN_CONFIG = defaultReceiptConfig.kitchen as unknown as KitchenConfig;
// The phone-order default is the kitchen default with the `k_phone_order`
// banner in front — so a phone ticket looks like the store's kitchen ticket
// plus the banner until the restaurant styles it separately. Luigi 2026-08-16.
export const DEFAULT_PHONE_CONFIG = defaultReceiptConfig.phone as unknown as PhoneConfig;

function defaultConfigFor(receiptType: ReceiptTemplateType): ReceiptConfig {
  if (receiptType === "customer") return DEFAULT_CUSTOMER_CONFIG;
  if (receiptType === "phone") return DEFAULT_PHONE_CONFIG;
  return DEFAULT_KITCHEN_CONFIG;
}

// ─── Config parser (handles old + new format) ─────────────────────────────────

export function parseReceiptConfig(raw: string | null | undefined, receiptType: "customer"): CustomerConfig;
export function parseReceiptConfig(raw: string | null | undefined, receiptType: "kitchen"): KitchenConfig;
export function parseReceiptConfig(raw: string | null | undefined, receiptType: "phone"): PhoneConfig;
export function parseReceiptConfig(raw: string | null | undefined, receiptType: ReceiptTemplateType): ReceiptConfig;
export function parseReceiptConfig(raw: string | null | undefined, receiptType: ReceiptTemplateType): ReceiptConfig {
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
        const defaults = defaultConfigFor(receiptType);
        const savedIds = new Set((parsed.sections as any[]).map((s: any) => s.id));
        // Insert each missing default section NEAR its position in the current
        // default layout (clamped) — so a newly-added section (e.g. the
        // reservation block) lands somewhere sensible for restaurants that
        // already saved a template, instead of being dumped at the very end.
        defaults.sections.forEach((def, idx) => {
          if (!savedIds.has(def.id)) {
            parsed.sections.splice(Math.min(idx, parsed.sections.length), 0, def);
          }
        });

        return parsed as ReceiptConfig;
      }
    } catch {}
  }
  return { ...defaultConfigFor(receiptType) };
}
