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
  | "order_info" | "customer_info" | "items" | "modifiers"
  /** Applied-promotions box — renders only when the order has any
   *  promo in its `appliedPromos` snapshot. Shows each promo by name
   *  + savings, framed by divider lines. Restaurants can disable the
   *  whole box by toggling enabled=false. */
  | "promos"
  | "totals" | "payment" | "notes"
  | "thank_you" | "footer";

export type KitchenSectionType =
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

export type ReceiptConfig = CustomerConfig | KitchenConfig;

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
  return receiptType === "customer"
    ? { ...DEFAULT_CUSTOMER_CONFIG }
    : { ...DEFAULT_KITCHEN_CONFIG };
}
