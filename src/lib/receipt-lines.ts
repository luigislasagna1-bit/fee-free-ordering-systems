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
import type { ReceiptOrder, ReceiptRestaurant, ReservationReceiptData } from "./receipt";
import { formatCurrency } from "./utils";
import type { DigestStats } from "./email";
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

// Module-scoped active currency, set at the top of each builder from the
// restaurant's currency. Single-threaded per request; defaults to USD.
let activeCurrency = "usd";
function fmt(n: number) { return formatCurrency(n, activeCurrency); }

// Module-scoped active timezone, set at the top of each builder from the
// restaurant's timezone. Order timestamps are UTC and the server runs in UTC,
// so without an explicit timeZone these previewed/printed times showed the
// server clock, not the restaurant's. Defaults to undefined → runtime default
// (legacy behaviour) when a caller hasn't threaded a timezone through. Unlike
// the thermal builder this path renders to HTML (no code-page limit), so the
// locale is free to localize too — but we change only the timezone here to
// keep parity with the thermal receipt's frozen-locale behaviour.
let activeTimezone: string | undefined = undefined;

function fmtDateTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleString(undefined, activeTimezone ? { timeZone: activeTimezone } : undefined);
}

function fmtTime(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit",
    ...(activeTimezone ? { timeZone: activeTimezone } : {}),
  });
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
        // Bundle children: indented under the parent, no per-child price.
        if (Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
          for (const child of item.bundleItems) {
            applyStyle(r, s);
            const variantPart = child.variantName ? ` (${child.variantName})` : "";
            const specPart =
              child.specialityFee && child.specialityFee > 0
                ? ` (+${fmt(child.specialityFee)})`
                : "";
            r.wrapped(`  - 1x ${child.name}${variantPart}${specPart}`, 4);
            if (modsEnabled && Array.isArray(child.modifiers)) {
              for (const mod of child.modifiers) {
                applyStyle(r, modStyle);
                r.wrapped(`    -> ${mod.name}`, 7);
              }
            }
            if (child.notes) {
              applyStyle(r, s);
              r.wrapped(`    !! ${child.notes}`, 7);
            }
          }
        }
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
        if (Array.isArray(item.bundleItems) && item.bundleItems.length > 0) {
          for (const child of item.bundleItems) {
            applyStyle(r, s);
            const variantPart = child.variantName ? ` (${child.variantName})` : "";
            const specPart =
              child.specialityFee && child.specialityFee > 0
                ? ` (+${fmt(child.specialityFee)})`
                : "";
            r.wrapped(`  - ${child.name}${variantPart}${specPart}`, 2);
            if (modsEnabled && Array.isArray(child.modifiers)) {
              for (const mod of child.modifiers) {
                applyStyle(r, modStyle);
                r.wrapped(`    + ${mod.name}`, 4);
              }
            }
          }
        }
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

    case "promos":
    case "k_promos": {
      // Applied promotions section — see receipt.ts for the spec.
      if (!order.appliedPromos) break;
      try {
        const promos = JSON.parse(order.appliedPromos) as Array<{
          name: string; type: string; discount: number; couponCode?: string;
        }>;
        if (!Array.isArray(promos) || promos.length === 0) break;
        r.line("* PROMOS APPLIED *");
        for (const p of promos) {
          const label = p.couponCode
            ? `  ${p.name} [${p.couponCode}]`
            : `  ${p.name}`;
          r.columns(label, p.discount > 0 ? `-${fmt(p.discount)}` : "FREE");
        }
      } catch { /* malformed JSON — skip */ }
      break;
    }

    case "totals":
      r.columns(t("receipt.customer.subtotal"), fmt(order.subtotal));
      if ((order.couponDiscount ?? 0) > 0)
        r.columns(t("receipt.customer.couponDiscount"), `-${fmt(order.couponDiscount!)}`);
      if ((order.promoDiscount ?? 0) > 0)
        r.columns(t("receipt.customer.promoDiscount"), `-${fmt(order.promoDiscount!)}`);
      // Delivery line — when a free-delivery promo was applied, show
      // the ORIGINAL fee inline ("FREE (was $7.99)") since the bitmap
      // path also can't render strike-through.
      {
        const promosRaw = (order as any).appliedPromos as string | null | undefined;
        let savedDeliveryFee = 0;
        if (promosRaw) {
          try {
            const promos = JSON.parse(promosRaw) as Array<{ type: string; discount: number }>;
            const fd = Array.isArray(promos) ? promos.find((p) => p.type === "free_delivery") : null;
            if (fd && fd.discount > 0) savedDeliveryFee = fd.discount;
          } catch { /* ignore */ }
        }
        if (savedDeliveryFee > 0) {
          r.columns(t("receipt.customer.deliveryFee"), `FREE (was ${fmt(savedDeliveryFee)})`);
        } else if (order.deliveryFee > 0) {
          r.columns(t("receipt.customer.deliveryFee"), fmt(order.deliveryFee));
        }
      }
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
  activeCurrency = restaurant.currency ?? "usd";
  activeTimezone = restaurant.timezone ?? undefined;
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
  activeCurrency = restaurant.currency ?? "usd";
  activeTimezone = restaurant.timezone ?? undefined;
  const r = new LinesBuilder(paperWidth);
  const t = await getDict(locale);
  renderSections(r, config, order, restaurant, t);
  r.nl(4);
  r.cut();
  return r.lines;
}

/**
 * Structured-lines renderer for reservation receipts — parallel to
 * `buildReservationReceipt` in receipt.ts (which produces ESC/POS
 * bytes for raw-TCP / PrintNode). The two functions emit identical
 * layouts; this one outputs ReceiptLine[] for the StarXpand bitmap
 * renderer used by the native Android print pipe. Mirror any
 * formatting change here when receipt.ts's reservation builder
 * changes. Luigi 2026-06-01 — closes the direct-LAN reservation
 * print gap so reservations match orders' two-format output.
 */
export async function buildReservationReceiptLines(
  data: ReservationReceiptData,
  paperWidth = "80mm",
  locale: string = "en",
): Promise<ReceiptLine[]> {
  activeCurrency = data.currency ?? "usd";
  activeTimezone = data.timezone ?? undefined;
  const r = new LinesBuilder(paperWidth);
  const t = await getDict(locale);

  r.center().sizeMode(24).bold(true).line(t("receipt.reservation.title")).bold(false).sizeMode(12);
  r.line("");
  r.line(data.restaurantName);
  r.divider("-");

  r.left().bold(true).line(`#${data.confirmationCode}`).bold(false);
  r.line(`${t("receipt.reservation.status")}: ${data.status.toUpperCase()}`);
  r.line(`${t("receipt.reservation.printed")}: ${fmtDateTime(data.createdAt)}`);
  r.divider("-");

  r.bold(true).line(t("receipt.reservation.guest")).bold(false);
  r.line(data.customerName);
  if (data.customerPhone) r.line(data.customerPhone);
  if (data.customerEmail) r.line(data.customerEmail);
  r.divider("-");

  r.bold(true).line(t("receipt.reservation.booking")).bold(false);
  r.sizeMode(24).line(data.date).sizeMode(12);
  r.sizeMode(24).line(data.time).sizeMode(12);
  r.line(t("receipt.reservation.partyOf", { n: data.partySize }));
  if (data.tableName) r.line(`${t("receipt.reservation.table")}: ${data.tableName}`);
  r.divider("-");

  if (data.notes) {
    r.bold(true).line(t("receipt.reservation.notes")).bold(false);
    r.line(data.notes);
    r.divider("-");
  }

  if ((data.depositAmount ?? 0) > 0) {
    r.bold(true).line(t("receipt.reservation.deposit")).bold(false);
    r.columns(t("receipt.reservation.amount"), fmt(data.depositAmount ?? 0));
    r.columns(t("receipt.reservation.status"), data.depositPaid ? "PAID" : "PENDING");
    r.divider("-");
  }

  if ((data.preOrderTotal ?? 0) > 0) {
    r.bold(true).line(t("receipt.reservation.preOrder")).bold(false);
    r.columns(t("receipt.customer.subtotal"), fmt(data.preOrderTotal ?? 0));
    r.line(t("receipt.reservation.preOrderHint"));
    r.divider("-");
  }

  r.line("");
  r.center().line(t("receipt.customer.thankYou"));
  r.nl(4);
  r.cut();
  return r.lines;
}

/**
 * End-of-day report formatted as a thermal-printer receipt
 * (Luigi 2026-06-02). Mirrors the on-screen /admin/reports/end-of-day
 * page but laid out for the 80mm Star TSP143 paper roll: stat
 * highlights at the top, by-channel breakdown, payment split, money
 * breakdown, and a printed timestamp footer.
 *
 * Sized for a busy service: owner prints at close, staples it next
 * to the till, knows the day's numbers without opening a laptop.
 * Same DigestStats shape the email digest uses so the printed
 * report and tomorrow morning's email will agree to the cent.
 */
export async function buildEndOfDayReceiptLines(
  stats: DigestStats,
  paperWidth = "80mm",
  locale: string = "en",
  currency: string = "usd",
): Promise<ReceiptLine[]> {
  activeCurrency = currency;
  const r = new LinesBuilder(paperWidth);
  // Title block — restaurant name + report header
  r.center().sizeMode(24).bold(true).line("END OF DAY").bold(false).sizeMode(12);
  r.line("");
  r.line(stats.restaurantName);
  r.divider("=");

  // Period
  r.center().line(stats.periodLabel);
  r.center().line(stats.comparisonLabel);
  r.left().divider("-");

  // Sales + orders — the headline numbers, big
  r.bold(true).line("SALES").bold(false);
  r.sizeMode(24).line(formatMoney(stats.sales)).sizeMode(12);
  r.line(deltaLabel(stats.salesDelta));
  r.line("");

  r.bold(true).line("ORDERS").bold(false);
  r.sizeMode(24).line(String(stats.orders)).sizeMode(12);
  r.line(deltaLabel(stats.ordersDelta));
  r.line("");

  r.bold(true).line("AVG TICKET").bold(false);
  r.line(formatMoney(stats.avgOrderValue));
  r.line(deltaLabel(stats.avgOrderValueDelta));
  r.line("");

  r.bold(true).line("RESERVATIONS").bold(false);
  r.line(String(stats.tableReservations));
  r.line(deltaLabel(stats.reservationsDelta));
  r.divider("-");

  // By channel
  r.bold(true).line("BY CHANNEL").bold(false);
  r.columns("Pickup",   `${stats.pickupOrders}  ${formatMoney(stats.pickupSales)}`);
  r.columns("Delivery", `${stats.deliveryOrders}  ${formatMoney(stats.deliverySales)}`);
  r.columns("Dine-in",  `${stats.dineInOrders}  ${formatMoney(stats.dineInSales)}`);
  r.divider("-");

  // Payment split
  r.bold(true).line("PAYMENT SPLIT").bold(false);
  r.columns("Online (card)", `${stats.onlinePayments}  ${formatMoney(stats.onlinePaymentsAmount)}`);
  r.columns("Offline",       `${stats.offlinePayments}  ${formatMoney(stats.offlinePaymentsAmount)}`);
  r.divider("-");

  // Money breakdown
  r.bold(true).line("MONEY BREAKDOWN").bold(false);
  r.columns("Subtotal",      formatMoney(stats.subTotals));
  r.columns("Tax",           formatMoney(stats.taxAmount));
  r.columns("Delivery fees", formatMoney(stats.deliveryFees));
  r.columns("Tips",          formatMoney(stats.tips));
  if (stats.otherFees > 0) r.columns("Other fees", formatMoney(stats.otherFees));
  r.divider("=");
  r.bold(true).columns("TOTAL TAKEN IN", formatMoney(stats.total)).bold(false);
  r.line("");

  // Printed-at footer
  r.center().line(`Printed ${new Date().toLocaleString(locale)}`);
  r.nl(4);
  r.cut();
  return r.lines;
}

function formatMoney(n: number): string {
  return formatCurrency(n ?? 0, activeCurrency);
}

function deltaLabel(pct: number): string {
  if (!Number.isFinite(pct) || Math.abs(pct) < 0.5) return "(no change vs prior)";
  const sign = pct > 0 ? "+" : "-";
  return `(${sign}${Math.abs(Math.round(pct))}% vs prior)`;
}
