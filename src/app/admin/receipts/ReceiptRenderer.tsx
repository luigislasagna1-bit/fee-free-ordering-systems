"use client";
import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import type { CustomerConfig, KitchenConfig, Section, SectionStyle } from "@/lib/receipt-schema";

// Paper widths in px at 96 dpi:
//   80 mm thermal = 302 px (default — by far the most common)
//   58 mm thermal = 220 px (small handheld receipt printers)
// ReceiptRenderer accepts an optional `widthPx` prop to switch the
// preview — preserving PAPER_WIDTH_PX as the default for backwards
// compat with the existing print pipeline.
export const PAPER_WIDTH_PX = 302;
export const PAPER_WIDTH_58_PX = 220;

// ─── Sample order for live preview ───────────────────────────────────────────

// Fixed date for the live preview so server-side rendering and client-side
// rendering produce the same string.  Using `new Date()` here causes hydration
// errors because the value differs between SSR and CSR runs.
const SAMPLE_CREATED_AT = "2026-05-12T16:45:00.000Z";

export const SAMPLE_ORDER = {
  orderNumber: "ORD-001234",
  customerName: "Jane Smith",
  customerPhone: "(555) 987-6543",
  customerEmail: "jane@example.com",
  type: "pickup" as "pickup" | "delivery",
  createdAt: SAMPLE_CREATED_AT,
  deliveryAddress: "123 Oak Street",
  deliveryCity: "New York",
  deliveryZip: "10001",
  items: [
    { name: "Margherita Pizza", quantity: 2, price: 14.99, subtotal: 29.98, modifiers: [{ name: 'Large (14")' }, { name: "Extra Cheese" }], notes: "Well done please" },
    { name: "Caesar Salad",     quantity: 1, price: 9.99,  subtotal: 9.99,  modifiers: [], notes: "" },
    { name: "Soda",             quantity: 2, price: 2.99,  subtotal: 5.98,  modifiers: [{ name: "Diet Coke" }], notes: "" },
  ],
  subtotal: 45.95, taxAmount: 4.07, deliveryFee: 0, couponDiscount: 0, total: 50.02,
  paymentMethod: "cash",
  notes: "Extra napkins please",
  preparationTime: 20,
};

export type SampleOrder = typeof SAMPLE_ORDER;

/**
 * Returns a sample order varied by type — used by the live preview's
 * order-type toggle so restaurants can see what a Delivery receipt
 * looks like (with the address block) vs a Pickup vs a Dine-In one,
 * without having to place a real test order.
 *
 * Delivery: keeps the address fields populated so the "Delivery to:"
 *   block renders.
 * Pickup: clears the address fields — pickup receipts shouldn't have
 *   a delivery section even if data is present.
 * Dine-In: clears address + sets a table-style note so the kitchen
 *   knows where to deliver food.
 */
export function makeSampleOrder(orderType: "pickup" | "delivery" | "dine_in"): SampleOrder {
  if (orderType === "delivery") {
    return { ...SAMPLE_ORDER, type: "delivery", deliveryFee: 4.99, total: SAMPLE_ORDER.total + 4.99 };
  }
  if (orderType === "dine_in") {
    return {
      ...SAMPLE_ORDER,
      type: "pickup" as const, // schema-wise dine_in shares pickup's type field
      deliveryAddress: "",
      deliveryCity: "",
      deliveryZip: "",
      notes: "Table 7 · " + SAMPLE_ORDER.notes,
    };
  }
  // default = pickup
  return {
    ...SAMPLE_ORDER,
    type: "pickup",
    deliveryAddress: "",
    deliveryCity: "",
    deliveryZip: "",
    deliveryFee: 0,
  };
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function sectionCSS(s: SectionStyle): React.CSSProperties {
  return {
    fontSize: `${s.fontSize}px`,
    fontWeight: s.bold ? "bold" : "normal",
    textAlign: s.align,
    lineHeight: s.lineHeight,
    color: s.highlight ? "#ffffff" : s.color,
    backgroundColor: s.highlight ? "#000000" : (s.bgColor !== "transparent" ? s.bgColor : undefined),
    paddingTop: `${s.paddingTop}px`,
    paddingBottom: `${s.paddingBottom}px`,
    paddingLeft: "10px",
    paddingRight: "10px",
    boxSizing: "border-box" as const,
    width: "100%",
  };
}

const DIVIDER: React.CSSProperties = { borderTop: "1px dashed #777", margin: "2px 0" };
const SOLID: React.CSSProperties  = { borderTop: "1px solid #000",   margin: "4px 0" };

const fmt = (n: number) => `$${n.toFixed(2)}`;
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// ─── Customer section renderers ───────────────────────────────────────────────

function renderCustomer(
  section: Section,
  order: SampleOrder,
  restaurant: any,
  config: CustomerConfig,
  t: ReturnType<typeof useTranslations<"admin.receiptRenderer">>
): React.ReactNode {
  const s = section.style;
  const dim = s.highlight ? "#cccccc" : "#555555";
  const small: React.CSSProperties = { fontSize: `${Math.max(9, s.fontSize - 2)}px`, color: dim };
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", marginBottom: "1px" };

  switch (section.type) {
    case "store_name":
      return <span>{restaurant?.name || t("yourRestaurant")}</span>;

    case "store_info":
      return (
        <span>
          {restaurant?.address ? <span>{restaurant.address}{restaurant.city ? `, ${restaurant.city}` : ""}{restaurant.zip ? ` ${restaurant.zip}` : ""}<br /></span> : null}
          {restaurant?.phone ? <span>{restaurant.phone}<br /></span> : null}
          {restaurant?.email ? <span>{restaurant.email}</span> : null}
        </span>
      );

    case "order_info":
      return (
        <span>
          <span style={row}><b>{t("orderNumber")}</b><span>{order.orderNumber}</span></span>
          <span style={row}><b>{t("date")}</b><span>{fmtDate(order.createdAt)}</span></span>
          <span style={row}><b>{t("time")}</b><span>{fmtTime(order.createdAt)}</span></span>
          <span style={row}><b>{t("type")}</b><span style={{ textTransform: "capitalize" }}>{order.type}</span></span>
        </span>
      );

    // Reserve-then-order block. Preview shows a representative sample so the
    // owner can style it; on a real receipt it prints only for pre-orders.
    case "reservation":
      return (
        <span>
          <span style={{ display: "block", fontWeight: "bold" }}>🪑 TABLE RESERVATION + PRE-ORDER</span>
          <span style={{ display: "block" }}>Party of 2 · {fmtDate(order.createdAt)} {fmtTime(order.createdAt)}</span>
        </span>
      );

    // ASAP-vs-scheduled timing line. The preview sample is an ASAP order; a
    // real scheduled order prints "ORDER FOR LATER: <date/time>" here instead.
    case "timing":
      return <span><b>{t("asap")}</b> : {fmtTime(order.createdAt)}</span>;

    case "customer_info":
      return (
        <span>
          <span style={{ display: "block", fontWeight: "bold" }}>{order.customerName}</span>
          {order.customerPhone && <span style={{ display: "block", ...small }}>{order.customerPhone}</span>}
          {order.type === "delivery" && order.deliveryAddress && (
            <span style={{ display: "block", ...small }}>{order.deliveryAddress}, {order.deliveryCity} {order.deliveryZip}</span>
          )}
        </span>
      );

    case "items": {
      // Modifiers use the "modifiers" section's style if it exists and is
      // enabled — same logic as the print renderer.  Falls back to a derived
      // small style if the modifiers section is missing.
      const modSection = config.sections.find((sec) => sec.type === "modifiers");
      const modsEnabled = modSection?.enabled !== false;
      const modCSS: React.CSSProperties | undefined = modSection && modSection.enabled
        ? {
            fontSize: `${modSection.style.fontSize}px`,
            fontWeight: modSection.style.bold ? "bold" : "normal",
            textAlign: modSection.style.align,
            color: modSection.style.highlight ? "#ffffff" : modSection.style.color,
            backgroundColor: modSection.style.highlight ? "#000000" : undefined,
          }
        : undefined;
      return (
        <span>
          {order.items.map((item, i) => {
            const bundle = Array.isArray((item as any).bundleItems)
              ? ((item as any).bundleItems as Array<{
                  name: string;
                  variantName?: string | null;
                  specialityFee?: number;
                  modifiers?: Array<{ name: string }>;
                }>)
              : null;
            return (
              <span key={i} style={{ display: "block", marginBottom: "6px" }}>
                <span style={row}>
                  <span style={{ fontWeight: "inherit" }}>{item.quantity}× {item.name}</span>
                  <span style={{ fontWeight: "inherit" }}>{fmt(item.subtotal)}</span>
                </span>
                {bundle && bundle.length > 0 && bundle.map((child, j) => (
                  <span key={`b${j}`} style={{ display: "block", paddingLeft: "14px", ...(modCSS ?? small) }}>
                    - {child.name}
                    {child.variantName ? ` (${child.variantName})` : ""}
                    {child.specialityFee && child.specialityFee > 0 ? ` (+${fmt(child.specialityFee)})` : ""}
                  </span>
                ))}
                {modsEnabled && item.modifiers.map((m, j) => (
                  <span key={j} style={{ display: "block", paddingLeft: "14px", ...(modCSS ?? small) }}>+ {m.name}</span>
                ))}
                {item.notes && (
                  <span style={{ display: "block", paddingLeft: "14px", fontSize: `${Math.max(9, s.fontSize - 2)}px`, color: s.highlight ? "#ffd" : "#b45309", fontStyle: "italic" }}>
                    {t("itemNote", { note: item.notes })}
                  </span>
                )}
              </span>
            );
          })}
        </span>
      );
    }

    case "modifiers":
      // Style-only section — handled inside the "items" case.  Return null
      // so the main loop doesn't render it as its own block.
      return null;

    case "promos":
    case "k_promos": {
      // Applied promotions preview — sample 2 promos so the owner sees
      // the layout in the editor. Live receipts only render this when
      // order.appliedPromos is non-empty.
      const samplePromos = [
        { name: "Free Delivery", couponCode: undefined as string | undefined, savings: 7.99, free: true },
        { name: "July Special",  couponCode: "JULY10", savings: 4.54, free: false },
      ];
      return (
        <span>
          <span style={{ display: "block", fontWeight: "bold" }}>{t("promosApplied")}</span>
          {samplePromos.map((p, i) => (
            <span key={i} style={row}>
              <span>
                &nbsp;&nbsp;{p.name}
                {p.couponCode && <> [{p.couponCode}]</>}
              </span>
              <span>{p.free ? t("free") : `-${fmt(p.savings)}`}</span>
            </span>
          ))}
        </span>
      );
    }

    case "totals":
      return (
        <span>
          <span style={row}><span>{t("subtotal")}</span><span>{fmt(order.subtotal)}</span></span>
          {order.couponDiscount > 0 && <span style={{ ...row, color: s.highlight ? "#9f9" : "#16a34a" }}><span>{t("discount")}</span><span>-{fmt(order.couponDiscount)}</span></span>}
          {order.taxAmount > 0    && <span style={row}><span>{t("tax")}</span><span>{fmt(order.taxAmount)}</span></span>}
          {order.deliveryFee > 0  && <span style={row}><span>{t("deliveryFee")}</span><span>{fmt(order.deliveryFee)}</span></span>}
          <span style={{ ...SOLID, display: "block" }} />
          <span style={{ ...row, fontWeight: "bold", fontSize: `${s.fontSize + 2}px` }}><span>{t("total")}</span><span>{fmt(order.total)}</span></span>
        </span>
      );

    case "payment":
      return <span>{t("payment")}: <b style={{ textTransform: "capitalize" }}>{order.paymentMethod}</b></span>;

    case "notes":
      if (!order.notes) return null;
      return (
        <span style={{ display: "block", border: "1px dashed #888", padding: "4px 6px", borderRadius: 2 }}>
          <b>{t("noteLabel")}: </b>{order.notes}
        </span>
      );

    case "thank_you":
      return <span>{config.thankYouMessage}</span>;

    case "footer":
      return <span style={{ color: s.highlight ? "#ccc" : dim }}>{config.footerText}</span>;

    default:
      return null;
  }
}

// ─── Kitchen section renderers ────────────────────────────────────────────────

function renderKitchen(section: Section, order: SampleOrder, config: KitchenConfig, t: ReturnType<typeof useTranslations<"admin.receiptRenderer">>): React.ReactNode {
  const s = section.style;
  const dim = s.highlight ? "#cccccc" : "#555555";
  const small: React.CSSProperties = { fontSize: `${Math.max(9, s.fontSize - 3)}px`, color: dim, fontWeight: "normal" };

  switch (section.type) {
    case "k_title":
      return <span>{t("kitchenOrderTitle")}</span>;

    case "k_order_type":
      return <span>{order.type.toUpperCase()}</span>;

    // Reserve-then-order block. Preview shows a sample; prints only for pre-orders.
    case "k_reservation":
      return (
        <span>
          <span style={{ display: "block", fontWeight: "bold" }}>🪑 TABLE RESERVATION + PRE-ORDER</span>
          <span style={{ display: "block" }}>Party of 2 · {fmtDate(order.createdAt)} {fmtTime(order.createdAt)}</span>
        </span>
      );

    case "k_order_number":
      return <span>#{order.orderNumber}</span>;

    case "k_datetime":
      return <span>{fmtDate(order.createdAt)} {fmtTime(order.createdAt)}</span>;

    // ASAP-vs-scheduled timing line. The preview sample is an ASAP order; a
    // real scheduled order prints "** ORDER FOR LATER **" + date/time here.
    case "k_timing":
      return <span style={{ fontWeight: "bold" }}>{t("asap")} : {fmtTime(order.createdAt)}</span>;

    case "k_customer":
      return (
        <span>
          <span style={{ display: "block" }}>{order.customerName}</span>
          {order.customerPhone && <span style={{ display: "block", ...small }}>{order.customerPhone}</span>}
          {order.type === "delivery" && order.deliveryAddress && (
            <span style={{ display: "block", ...small }}>{order.deliveryAddress}, {order.deliveryCity}</span>
          )}
        </span>
      );

    case "k_items": {
      // Modifier lines use the "k_modifiers" section's style if present and
      // enabled — matches the print renderer's behavior so the preview stays
      // in sync with what the printer actually outputs.
      const modSection = config.sections.find((sec) => sec.type === "k_modifiers");
      const modsEnabled = modSection?.enabled !== false;
      const modCSS: React.CSSProperties | undefined = modSection && modSection.enabled
        ? {
            fontSize: `${modSection.style.fontSize}px`,
            fontWeight: modSection.style.bold ? "bold" : "normal",
            textAlign: modSection.style.align,
            color: modSection.style.highlight ? "#ffffff" : modSection.style.color,
            backgroundColor: modSection.style.highlight ? "#000000" : undefined,
          }
        : undefined;
      return (
        <span>
          {order.items.map((item, i) => {
            const bundle = Array.isArray((item as any).bundleItems)
              ? ((item as any).bundleItems as Array<{
                  name: string;
                  variantName?: string | null;
                  specialityFee?: number;
                }>)
              : null;
            return (
            <span key={i} style={{ display: "block", marginBottom: "10px" }}>
              <span style={{ display: "block" }}>{item.quantity}× {item.name}</span>
              {bundle && bundle.length > 0 && bundle.map((child, j) => (
                <span key={`b${j}`} style={{ display: "block", paddingLeft: "16px", ...(modCSS ?? { ...small, fontSize: `${Math.max(10, s.fontSize - 4)}px` }) }}>
                  - {child.name}
                  {child.variantName ? ` (${child.variantName})` : ""}
                </span>
              ))}
              {modsEnabled && item.modifiers.map((m, j) => (
                <span key={j} style={{ display: "block", paddingLeft: "16px", ...(modCSS ?? { ...small, fontSize: `${Math.max(10, s.fontSize - 4)}px` }) }}>
                  → {m.name}
                </span>
              ))}
              {item.notes && (
                <span style={{ display: "block", paddingLeft: "16px", fontSize: `${Math.max(10, s.fontSize - 4)}px`, color: s.highlight ? "#ffd" : "#b45309", fontWeight: "bold" }}>
                  ⚠ {item.notes}
                </span>
              )}
            </span>
            );
          })}
        </span>
      );
    }

    case "k_modifiers":
      // Style-only section — handled inside "k_items".  Return null so the
      // main loop doesn't render it as its own block.
      return null;

    case "k_notes":
      if (!order.notes) return <span style={{ color: dim, fontStyle: "italic", fontWeight: "normal", fontSize: `${s.fontSize - 2}px` }}>{t("noSpecialNotes")}</span>;
      return (
        <span style={{ display: "block", border: `2px solid ${s.highlight ? "#fff" : "#000"}`, padding: "6px 8px" }}>
          <span style={{ display: "block", fontWeight: "bold", marginBottom: "2px" }}>⚠ {t("kitchenNoteHeading")}:</span>
          {order.notes}
        </span>
      );

    case "k_prep":
      return <span>{t("prepTime")}</span>;

    default:
      return null;
  }
}

// ─── Main renderer component ──────────────────────────────────────────────────

interface CustomerProps { type: "customer"; config: CustomerConfig; order?: SampleOrder; restaurant?: any; widthPx?: number }
interface KitchenProps  { type: "kitchen";  config: KitchenConfig;  order?: SampleOrder; restaurant?: any; widthPx?: number }
type Props = CustomerProps | KitchenProps;

export const ReceiptRenderer = forwardRef<HTMLDivElement, Props>(
  function ReceiptRenderer({ type, config, order = SAMPLE_ORDER, restaurant, widthPx }, ref) {
    const t = useTranslations("admin.receiptRenderer");
    const w = widthPx ?? PAPER_WIDTH_PX;
    return (
      <div
        ref={ref}
        style={{
          width: `${w}px`,
          minHeight: "200px",
          fontFamily: "'Courier New', Courier, monospace",
          backgroundColor: "#ffffff",
          color: "#000000",
          paddingTop: "4px",
          paddingBottom: "8px",
          boxSizing: "border-box",
        }}
      >
        {config.sections.map((section) => {
          if (!section.enabled) return null;

          const content =
            type === "customer"
              ? renderCustomer(section, order, restaurant, config as CustomerConfig, t)
              : renderKitchen(section, order, config as KitchenConfig, t);

          if (content === null) return null;

          return (
            <div key={section.id}>
              {section.style.dividerAbove && <div style={DIVIDER} />}
              <div style={sectionCSS(section.style)}>{content}</div>
              {section.style.dividerBelow && <div style={DIVIDER} />}
            </div>
          );
        })}
      </div>
    );
  }
);
