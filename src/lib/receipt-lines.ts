// Template-driven receipt rendering for the StarXpand bitmap path.
//
// Mirrors `src/lib/receipt.ts`'s `buildKitchenReceiptFromConfig` /
// `buildCustomerReceiptFromConfig` BUT emits structured `ReceiptLine[]`
// (text + style hints) instead of ESC/POS bytes. The native Kotlin
// renderer on Android turns each line into pixels with the right
// font size, bold, alignment, and inverse highlighting.
//
// Why a parallel file instead of refactoring `receipt.ts` to share the
// render loop: `receipt.ts` is the GOLDEN ESC/POS pipeline locked in
// 2026-05-12 and must not be touched (see CLAUDE.md memory). The
// duplication cost (~250 lines) is the price of keeping that pipeline
// untouched while adding a parallel structured-output path for native.
//
// When you edit a section's render logic in `receipt.ts`, mirror the
// change here. The two functions are deliberately parallel and easy
// to diff side-by-side.
//
// LineHeight + size mapping note: the template stores `fontSize` in
// PX, intended for the HTML preview at desktop resolution. The Kotlin
// bitmap renderer interprets those numbers as relative sizing on a
// 576-dot (80mm) thermal printer — see `renderReceiptBitmap` in
// `StarXpandBridge.kt`.

import type { CustomerConfig, KitchenConfig, Section, SectionStyle } from "./receipt-schema";
import type { ReceiptOrder, ReceiptRestaurant } from "./receipt";
import { getDict, type Translator } from "./i18n-dict";

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * A single rendered receipt line. Sent over the wire to the native
 * plugin which renders each entry into pixels on the thermal printer
 * bitmap. Keep this serializable — only primitives + plain enums.
 */
export type ReceiptLine =
  | {
      kind: "text";
      text: string;
      fontSize?: number;
      bold?: boolean;
      align?: "left" | "center" | "right";
      /** Black background, white text — used for the "DELIVERY" badge. */
      highlight?: boolean;
    }
  | {
      kind: "twoCol";
      left: string;
      right: string;
      fontSize?: number;
      bold?: boolean;
      highlight?: boolean;
    }
  | { kind: "divider" }
  | { kind: "feed"; count: number }
  | { kind: "cut" };

// ─── Internal builder ────────────────────────────────────────────────────────

/**
 * Mimics the subset of `EscPos`'s public API that `renderSections` and
 * the per-section render functions use, but records structured lines
 * instead of emitting ESC/POS bytes.
 */
class LinesBuilder {
  readonly lines: ReceiptLine[] = [];
  readonly cw: number;
  private curAlign: "left" | "center" | "right" = "left";
  private curBold = false;
  private curHighlight = false;
  private curSize = 12;

  constructor(paperWidth: string) {
    // chars-per-line at normal size — same as EscPos so wrapped() can
    // mimic word-wrap behavior if we add it later.
    this.cw = paperWidth === "58mm" ? 32 : 48;
  }

  // ── Style setters (chainable) ──
  align(a: "left" | "center" | "right") { this.curAlign = a; return this; }
  left() { this.curAlign = "left"; return this; }
  center() { this.curAlign = "center"; return this; }
  right() { this.curAlign = "right"; return this; }
  bold(b: boolean) { this.curBold = b; return this; }
  invert(b: boolean) { this.curHighlight = b; return this; }
  sizeMode(px: number) { this.curSize = px; return this; }
  resetStyle() {
    this.curAlign = "left";
    this.curBold = false;
    this.curHighlight = false;
    this.curSize = 12;
    return this;
  }

  // ── Content emitters ──
  line(text: string) {
    this.lines.push({
      kind: "text",
      text: sanitize(text),
      fontSize: this.curSize,
      bold: this.curBold,
      align: this.curAlign,
      highlight: this.curHighlight,
    });
    return this;
  }

  /** Same as line() for our purposes — Kotlin renderer wraps on its side. */
  wrapped(text: string, _indent?: number) { return this.line(text); }

  columns(left: string, right: string) {
    this.lines.push({
      kind: "twoCol",
      left: sanitize(left),
      right: sanitize(right),
      fontSize: this.curSize,
      bold: this.curBold,
      highlight: this.curHighlight,
    });
    return this;
  }

  divider(_char: string) {
    this.lines.push({ kind: "divider" });
    return this;
  }

  nl(n = 1) {
    this.lines.push({ kind: "feed", count: n });
    return this;
  }

  init() { return this; }
  cut() { this.lines.push({ kind: "cut" }); return this; }
}

// Sanitize typographic chars the same way EscPos does so the bitmap
// renderer doesn't have to deal with multi-byte oddities either.
// (Android Canvas handles UTF-8 fine, but keeping output identical to
// the ESC/POS path means restaurants see the same receipt regardless
// of which printer they use.)
function sanitize(s: string): string {
  return s
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/×/g, "x")
    .replace(/→/g, "->")
    .replace(/⚠/g, "!")
    .replace(/•/g, "*");
}

// ─── Style application ──────────────────────────────────────────────────────

function applyStyle(r: LinesBuilder, s: SectionStyle) {
  r.align(s.align);
  r.invert(s.highlight);
  r.bold(s.bold);
  r.sizeMode(s.fontSize);
}

function blankLines(r: LinesBuilder, px: number) {
  // px → line count: same conversion as receipt.ts (px/8 rounded).
  const n = Math.max(0, Math.round(px / 8));
  if (n > 0) r.nl(n);
}

function fmt(n: number) { return `$${n.toFixed(2)}`; }

function fmtDateTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString();
}

function fmtTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function tOrderTypeUpper(type: string, t: Translator): string {
  const v = t(`receipt.orderTypes.${type}`);
  return v.startsWith("receipt.") ? type.toUpperCase() : v;
}

function tOrderTypeLower(type: string, t: Translator): string {
  const v = t(`receipt.orderTypesLower.${type}`);
  return v.startsWith("receipt.") ? type : v;
}

function findStyleSection(
  config: CustomerConfig | KitchenConfig,
  type: string,
): SectionStyle | null {
  const section = config.sections.find((s) => s.type === type);
  if (!section || !section.enabled) return null;
  return section.style;
}

// ─── Per-section renderers ──────────────────────────────────────────────────

function renderKitchenSection(
  r: LinesBuilder,
  section: Section,
  order: ReceiptOrder,
  config: KitchenConfig,
  t: Translator,
): void {
  const s = section.style;
  switch (section.type) {
    case "k_title":
      r.line(`--- ${t("receipt.kitchen.title")} ---`);
      break;

    case "k_order_type":
      r.line(`  ${tOrderTypeUpper(order.type, t)}  `);
      break;

    case "k_order_number":
      r.line(`#${order.orderNumber}`);
      break;

    case "k_datetime":
      r.line(fmtDateTime(order.createdAt));
      if (order.estimatedReady) r.line(`${t("kitchen.ready")} : ${fmtTime(order.estimatedReady)}`);
      break;

    case "k_customer":
      r.line(order.customerName);
      if (order.customerPhone) r.line(order.customerPhone);
      if (order.type === "delivery" && order.deliveryAddress) {
        r.line(order.deliveryAddress);
        if (order.deliveryCity) r.line(order.deliveryCity);
        if (order.deliveryZoneName || order.deliveryEstimatedMinutes) {
          const parts: string[] = [];
          if (order.deliveryZoneName) parts.push(`${order.deliveryZoneName}`);
          if (order.deliveryEstimatedMinutes) parts.push(`~${order.deliveryEstimatedMinutes} ${t("receipt.kitchen.minutes")}`);
          r.line(parts.join(" · "));
        }
      }
      break;

    case "k_items": {
      const modStyle = findStyleSection(config, "k_modifiers");
      const modsEnabled = modStyle !== null;
      for (const item of order.items) {
        applyStyle(r, s);
        r.line(`${item.quantity}x ${item.name}`);
        if (modsEnabled) {
          for (const mod of item.modifiers) {
            applyStyle(r, modStyle);
            r.wrapped(`  -> ${mod.name}`, 5);
          }
        }
        if (item.notes) {
          applyStyle(r, s);
          r.wrapped(`  !! ${item.notes}`, 5);
        }
      }
      break;
    }

    case "k_modifiers":
      // Style-only section.
      break;

    case "k_notes":
      if (order.notes) {
        r.line(`${t("receipt.kitchen.notes")}:`);
        r.wrapped(order.notes);
      }
      break;

    case "k_prep": {
      const payStatus = order.paymentStatus === "paid"
        ? "PAID"
        : `${t("receipt.customer.payOnType", { type: tOrderTypeLower(order.type, t) }).toUpperCase()}`;
      r.line(`${t("receipt.kitchen.payment")}: ${payStatus}`);
      if (order.preparationTime) r.line(`${t("receipt.kitchen.prep")}: ${order.preparationTime} ${t("receipt.kitchen.minutes")}`);
      break;
    }
  }
}

function renderCustomerSection(
  r: LinesBuilder,
  section: Section,
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  config: CustomerConfig,
  t: Translator,
): void {
  const s = section.style;
  switch (section.type) {
    case "store_name":
      r.wrapped(restaurant.name);
      break;

    case "store_info":
      if (restaurant.address || restaurant.city) {
        const parts: string[] = [];
        if (restaurant.address) parts.push(restaurant.address);
        if (restaurant.city) {
          let cityLine = restaurant.city;
          if (restaurant.state) cityLine += `, ${restaurant.state}`;
          if (restaurant.zip) cityLine += ` ${restaurant.zip}`;
          parts.push(cityLine);
        }
        r.wrapped(parts.join(", "));
      }
      if (restaurant.phone) r.wrapped(restaurant.phone);
      if (restaurant.email) r.wrapped(restaurant.email);
      break;

    case "order_info":
      r.line(`${t("receipt.customer.orderNumber")}${order.orderNumber}`);
      r.line(t("receipt.customer.title", { type: tOrderTypeUpper(order.type, t) }));
      r.line(`${t("receipt.customer.date")}: ${fmtDateTime(order.createdAt)}`);
      break;

    case "customer_info":
      r.line(order.customerName);
      if (order.customerPhone) r.line(order.customerPhone);
      if (order.customerEmail) r.line(order.customerEmail);
      if (order.type === "delivery" && order.deliveryAddress) {
        r.line(order.deliveryAddress);
        if (order.deliveryCity) r.line(order.deliveryCity);
      }
      break;

    case "items": {
      const modStyle = findStyleSection(config, "modifiers");
      const modsEnabled = modStyle !== null;
      for (const item of order.items) {
        applyStyle(r, s);
        r.columns(`${item.quantity}x ${item.name}`, fmt(item.subtotal));
        if (modsEnabled) {
          for (const mod of item.modifiers) {
            const p = mod.priceAdjustment !== 0 ? ` (+${fmt(mod.priceAdjustment)})` : "";
            applyStyle(r, modStyle);
            r.wrapped(`  + ${mod.name}${p}`, 2);
          }
        }
        if (item.notes) {
          applyStyle(r, s);
          r.wrapped(`  * Note: ${item.notes}`, 2);
        }
      }
      break;
    }

    case "modifiers":
      // Style-only.
      break;

    case "totals":
      r.columns(t("receipt.customer.subtotal"), fmt(order.subtotal));
      if ((order.couponDiscount ?? 0) > 0)
        r.columns(t("receipt.customer.couponDiscount"), `-${fmt(order.couponDiscount!)}`);
      if ((order.promoDiscount ?? 0) > 0)
        r.columns(t("receipt.customer.promoDiscount"), `-${fmt(order.promoDiscount!)}`);
      if (order.deliveryFee > 0) r.columns(t("receipt.customer.deliveryFee"), fmt(order.deliveryFee));
      if (order.appliedServiceFees) {
        try {
          const fees = JSON.parse(order.appliedServiceFees) as { name: string; amount: number }[];
          for (const fee of fees) {
            if (fee && typeof fee.amount === "number" && fee.amount > 0) {
              r.columns(fee.name, fmt(fee.amount));
            }
          }
        } catch { /* ignore malformed JSON */ }
      }
      if (order.taxAmount > 0) r.columns(t("receipt.customer.tax"), fmt(order.taxAmount));
      if ((order.tip ?? 0) > 0) r.columns(t("receipt.customer.tip"), fmt(order.tip!));
      r.divider("-");
      r.columns(t("receipt.customer.total"), fmt(order.total));
      break;

    case "payment": {
      const label = order.paymentMethod === "card" ? t("receipt.customer.creditCard")
        : order.paymentMethod === "cash" ? t("receipt.customer.cash")
        : order.paymentMethod;
      const status = order.paymentStatus === "paid" ? "PAID"
        : order.paymentStatus === "pending" ? t("receipt.customer.payOnType", { type: tOrderTypeLower(order.type, t) })
        : order.paymentStatus;
      r.line(`${t("receipt.kitchen.payment")}: ${label}`);
      r.line(`${t("receipt.reservation.status")}: ${status}`);
      break;
    }

    case "notes":
      if (order.notes) {
        r.line(`${t("receipt.customer.orderNotes")}:`);
        r.wrapped(order.notes);
      }
      break;

    case "thank_you":
      r.wrapped(config.thankYouMessage || t("receipt.customer.thankYou"));
      break;

    case "footer":
      if (config.footerText) r.wrapped(config.footerText);
      break;
  }
}

// ─── Section loop ───────────────────────────────────────────────────────────

const STYLE_ONLY_SECTIONS = new Set<string>(["k_modifiers", "modifiers"]);

function renderSections(
  r: LinesBuilder,
  config: CustomerConfig | KitchenConfig,
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  t: Translator,
) {
  for (const section of config.sections) {
    if (!section.enabled) continue;
    if (STYLE_ONLY_SECTIONS.has(section.type)) continue;
    const s = section.style;

    blankLines(r, s.paddingTop);
    if (s.dividerAbove) r.resetStyle().left().divider("-");
    applyStyle(r, s);

    if (config.receiptType === "kitchen") {
      renderKitchenSection(r, section, order, config as KitchenConfig, t);
    } else {
      renderCustomerSection(r, section, order, restaurant, config as CustomerConfig, t);
    }

    r.resetStyle().left();
    if (s.dividerBelow) r.divider("-");
    blankLines(r, s.paddingBottom);
  }
}

// ─── Public builders ────────────────────────────────────────────────────────

export async function buildKitchenReceiptLines(
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  config: KitchenConfig,
  paperWidth = "80mm",
  locale: string = "en",
): Promise<ReceiptLine[]> {
  const r = new LinesBuilder(paperWidth);
  const t = await getDict(locale);
  renderSections(r, config, order, restaurant, t);
  r.nl(4);
  r.cut();
  return r.lines;
}

export async function buildCustomerReceiptLines(
  order: ReceiptOrder,
  restaurant: ReceiptRestaurant,
  config: CustomerConfig,
  paperWidth = "80mm",
  locale: string = "en",
): Promise<ReceiptLine[]> {
  const r = new LinesBuilder(paperWidth);
  const t = await getDict(locale);
  renderSections(r, config, order, restaurant, t);
  r.nl(4);
  r.cut();
  return r.lines;
}
