"use client";
import { forwardRef } from "react";
import type { CustomerConfig, KitchenConfig, Section, SectionStyle } from "@/lib/receipt-schema";

// 80 mm thermal = 302 px at 96 dpi
export const PAPER_WIDTH_PX = 302;

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
  config: CustomerConfig
): React.ReactNode {
  const s = section.style;
  const dim = s.highlight ? "#cccccc" : "#555555";
  const small: React.CSSProperties = { fontSize: `${Math.max(9, s.fontSize - 2)}px`, color: dim };
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", marginBottom: "1px" };

  switch (section.type) {
    case "store_name":
      return <span>{restaurant?.name || "Your Restaurant"}</span>;

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
          <span style={row}><b>Order #</b><span>{order.orderNumber}</span></span>
          <span style={row}><b>Date</b><span>{fmtDate(order.createdAt)}</span></span>
          <span style={row}><b>Time</b><span>{fmtTime(order.createdAt)}</span></span>
          <span style={row}><b>Type</b><span style={{ textTransform: "capitalize" }}>{order.type}</span></span>
        </span>
      );

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
          {order.items.map((item, i) => (
            <span key={i} style={{ display: "block", marginBottom: "6px" }}>
              <span style={row}>
                <span style={{ fontWeight: "inherit" }}>{item.quantity}× {item.name}</span>
                <span style={{ fontWeight: "inherit" }}>{fmt(item.subtotal)}</span>
              </span>
              {modsEnabled && item.modifiers.map((m, j) => (
                <span key={j} style={{ display: "block", paddingLeft: "14px", ...(modCSS ?? small) }}>+ {m.name}</span>
              ))}
              {item.notes && (
                <span style={{ display: "block", paddingLeft: "14px", fontSize: `${Math.max(9, s.fontSize - 2)}px`, color: s.highlight ? "#ffd" : "#b45309", fontStyle: "italic" }}>
                  Note: {item.notes}
                </span>
              )}
            </span>
          ))}
        </span>
      );
    }

    case "modifiers":
      // Style-only section — handled inside the "items" case.  Return null
      // so the main loop doesn't render it as its own block.
      return null;

    case "totals":
      return (
        <span>
          <span style={row}><span>Subtotal</span><span>{fmt(order.subtotal)}</span></span>
          {order.couponDiscount > 0 && <span style={{ ...row, color: s.highlight ? "#9f9" : "#16a34a" }}><span>Discount</span><span>-{fmt(order.couponDiscount)}</span></span>}
          {order.taxAmount > 0    && <span style={row}><span>Tax</span><span>{fmt(order.taxAmount)}</span></span>}
          {order.deliveryFee > 0  && <span style={row}><span>Delivery</span><span>{fmt(order.deliveryFee)}</span></span>}
          <span style={{ ...SOLID, display: "block" }} />
          <span style={{ ...row, fontWeight: "bold", fontSize: `${s.fontSize + 2}px` }}><span>TOTAL</span><span>{fmt(order.total)}</span></span>
        </span>
      );

    case "payment":
      return <span>Payment: <b style={{ textTransform: "capitalize" }}>{order.paymentMethod}</b></span>;

    case "notes":
      if (!order.notes) return null;
      return (
        <span style={{ display: "block", border: "1px dashed #888", padding: "4px 6px", borderRadius: 2 }}>
          <b>Note: </b>{order.notes}
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

function renderKitchen(section: Section, order: SampleOrder, config: KitchenConfig): React.ReactNode {
  const s = section.style;
  const dim = s.highlight ? "#cccccc" : "#555555";
  const small: React.CSSProperties = { fontSize: `${Math.max(9, s.fontSize - 3)}px`, color: dim, fontWeight: "normal" };

  switch (section.type) {
    case "k_title":
      return <span>— KITCHEN ORDER —</span>;

    case "k_order_type":
      return <span>{order.type.toUpperCase()}</span>;

    case "k_order_number":
      return <span>#{order.orderNumber}</span>;

    case "k_datetime":
      return <span>{fmtDate(order.createdAt)} {fmtTime(order.createdAt)}</span>;

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
          {order.items.map((item, i) => (
            <span key={i} style={{ display: "block", marginBottom: "10px" }}>
              <span style={{ display: "block" }}>{item.quantity}× {item.name}</span>
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
          ))}
        </span>
      );
    }

    case "k_modifiers":
      // Style-only section — handled inside "k_items".  Return null so the
      // main loop doesn't render it as its own block.
      return null;

    case "k_notes":
      if (!order.notes) return <span style={{ color: dim, fontStyle: "italic", fontWeight: "normal", fontSize: `${s.fontSize - 2}px` }}>(no special notes)</span>;
      return (
        <span style={{ display: "block", border: `2px solid ${s.highlight ? "#fff" : "#000"}`, padding: "6px 8px" }}>
          <span style={{ display: "block", fontWeight: "bold", marginBottom: "2px" }}>⚠ NOTE:</span>
          {order.notes}
        </span>
      );

    case "k_prep":
      return <span>Prep Time: ________________ min</span>;

    default:
      return null;
  }
}

// ─── Main renderer component ──────────────────────────────────────────────────

interface CustomerProps { type: "customer"; config: CustomerConfig; order?: SampleOrder; restaurant?: any }
interface KitchenProps  { type: "kitchen";  config: KitchenConfig;  order?: SampleOrder; restaurant?: any }
type Props = CustomerProps | KitchenProps;

export const ReceiptRenderer = forwardRef<HTMLDivElement, Props>(
  function ReceiptRenderer({ type, config, order = SAMPLE_ORDER, restaurant }, ref) {
    return (
      <div
        ref={ref}
        style={{
          width: `${PAPER_WIDTH_PX}px`,
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
              ? renderCustomer(section, order, restaurant, config as CustomerConfig)
              : renderKitchen(section, order, config as KitchenConfig);

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
