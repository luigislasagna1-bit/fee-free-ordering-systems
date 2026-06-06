/**
 * Reusable email content blocks.
 *
 * Each component is designed for table-based rendering compatibility —
 * Outlook desktop in particular ignores flexbox/grid, so all layouts
 * use either block-level divs with explicit widths, or HTML tables when
 * we need columns. @react-email/components abstracts the worst of it
 * with `<Row>` / `<Column>` which render as `<table>` under the hood.
 */
import { Section, Row, Column, Hr } from "@react-email/components";
import { COLORS } from "./EmailLayout";
import { formatCurrency } from "@/lib/utils";

// `currency` props below are ISO 4217 codes (e.g. "usd", "eur", "gbp").
// Money renders through formatCurrency() so the symbol, placement, and
// separators match each market — "$1,234.56", "1.234,56 €", "£1,234.56".

/**
 * Body section — wraps content with consistent padding.
 */
export function EmailBody({ children }: { children: React.ReactNode }) {
  return (
    <Section style={{ padding: "24px 32px 8px" }}>
      {children}
    </Section>
  );
}

/**
 * Body paragraph with sensible defaults.
 */
export function P({ children, muted = false, size = "base" }: {
  children: React.ReactNode;
  muted?: boolean;
  size?: "sm" | "base" | "lg";
}) {
  const fontSize = size === "sm" ? 13 : size === "lg" ? 17 : 15;
  return (
    <p
      style={{
        fontSize,
        lineHeight: 1.55,
        color: muted ? COLORS.muted : COLORS.text,
        margin: "0 0 14px",
      }}
    >
      {children}
    </p>
  );
}

/**
 * Primary CTA button. Uses table-based rendering for Outlook compatibility.
 */
export function EmailButton({
  href, children, variant = "primary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const bg = variant === "primary" ? COLORS.emerald : "#ffffff";
  const fg = variant === "primary" ? "#ffffff" : COLORS.emeraldDk;
  const border = variant === "primary" ? COLORS.emerald : COLORS.emeraldDk;
  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      border={0}
      style={{ margin: "20px 0", borderCollapse: "collapse" }}
    >
      <tbody>
        <tr>
          <td
            style={{
              backgroundColor: bg,
              borderRadius: 10,
              border: `2px solid ${border}`,
            }}
          >
            <a
              href={href}
              style={{
                display: "inline-block",
                padding: "14px 28px",
                color: fg,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
                fontFamily: "inherit",
              }}
            >
              {children}
            </a>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Info card — for delivery addresses, order details, status info.
 * Light-grey background, rounded corners. Matches GloriaFood's "Your
 * delivery address" style box.
 */
export function InfoCard({
  label, children, accent = "neutral",
}: {
  label?: string;
  children: React.ReactNode;
  accent?: "neutral" | "emerald" | "amber" | "slate" | "rose";
}) {
  const bg =
    accent === "emerald" ? "#ecfdf5" :
    accent === "amber" ? "#fffbeb" :
    accent === "slate" ? "#f1f5f9" :
    accent === "rose" ? "#fff1f2" :
    "#f9fafb";
  const borderColor =
    accent === "emerald" ? "#a7f3d0" :
    accent === "amber" ? "#fde68a" :
    accent === "slate" ? "#cbd5e1" :
    accent === "rose" ? "#fecdd3" :
    COLORS.border;
  return (
    <div
      style={{
        background: bg,
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: "14px 16px",
        margin: "16px 0",
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: COLORS.muted,
            marginBottom: 6,
          }}
        >
          {label}
        </div>
      )}
      <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Inline badge — for order status, payment method, order type.
 * GloriaFood uses these for PICKUP / PAID ONLINE / DELIVERY etc.
 */
export function Badge({
  children, color = "emerald",
}: {
  children: React.ReactNode;
  color?: "emerald" | "amber" | "slate" | "rose" | "sky";
}) {
  const bg =
    color === "emerald" ? "#d1fae5" :
    color === "amber" ? "#fef3c7" :
    color === "slate" ? "#e2e8f0" :
    color === "rose" ? "#fee2e2" :
    "#e0f2fe";
  const fg =
    color === "emerald" ? "#065f46" :
    color === "amber" ? "#92400e" :
    color === "slate" ? "#334155" :
    color === "rose" ? "#9f1239" :
    "#075985";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 10px",
        borderRadius: 999,
        backgroundColor: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        lineHeight: 1.4,
        verticalAlign: "middle",
      }}
    >
      {children}
    </span>
  );
}

/**
 * Order items table — itemized list with modifiers and prices.
 * Matches the GloriaFood kitchen notification layout.
 */
export type EmailOrderItem = {
  name: string;
  quantity: number;
  price: number;
  /** Modifier / option lines shown indented under the item name. */
  modifiers?: { label: string; value: string; priceAdjustment?: number }[];
  /** Free-text customer note shown italic under modifiers. */
  notes?: string | null;
  /** Combo / bundle child picks — rendered indented under the parent line so
   *  the email lists every item + its options (toppings, sauces, etc.). */
  bundleItems?: {
    name: string;
    variantName?: string | null;
    modifiers?: { name: string }[];
  }[];
};

export function OrderItemsTable({
  items, currency = "usd",
}: {
  items: EmailOrderItem[];
  currency?: string;
}) {
  return (
    <table
      cellPadding={0}
      cellSpacing={0}
      border={0}
      width="100%"
      style={{
        borderCollapse: "collapse",
        margin: "16px 0",
        fontSize: 14,
      }}
    >
      <thead>
        <tr>
          <th
            style={{
              textAlign: "left",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: COLORS.muted,
              padding: "8px 0",
              borderBottom: `1px solid ${COLORS.border}`,
              width: 40,
            }}
          >
            Qty
          </th>
          <th
            style={{
              textAlign: "left",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: COLORS.muted,
              padding: "8px 0",
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            Items
          </th>
          <th
            style={{
              textAlign: "right",
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: COLORS.muted,
              padding: "8px 0",
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            Price
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={idx} style={{ verticalAlign: "top" }}>
            <td style={{ padding: "10px 0", color: COLORS.text, fontWeight: 600 }}>
              {item.quantity}×
            </td>
            <td style={{ padding: "10px 0" }}>
              <div style={{ color: COLORS.text, fontWeight: 600, marginBottom: 2 }}>
                {item.name}
              </div>
              {item.modifiers && item.modifiers.length > 0 && (
                <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 2 }}>
                  {item.modifiers.map((m, i) => (
                    <div key={i}>
                      {m.label ? `${m.label}: ` : ""}<strong style={{ color: COLORS.text }}>{m.value}</strong>
                      {m.priceAdjustment ? ` (+${formatCurrency(m.priceAdjustment, currency)})` : ""}
                    </div>
                  ))}
                </div>
              )}
              {item.bundleItems && item.bundleItems.length > 0 && (
                <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4, paddingLeft: 10, borderLeft: `2px solid ${COLORS.border}` }}>
                  {item.bundleItems.map((child, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>
                      <div style={{ color: COLORS.text }}>
                        • {child.name}{child.variantName ? ` (${child.variantName})` : ""}
                      </div>
                      {child.modifiers && child.modifiers.length > 0 && (
                        <div style={{ paddingLeft: 10 }}>
                          {child.modifiers.map((m, mi) => (
                            <div key={mi}>+ {m.name}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {item.notes && (
                <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4, fontStyle: "italic" }}>
                  Note: {item.notes}
                </div>
              )}
            </td>
            <td style={{ padding: "10px 0", color: COLORS.text, textAlign: "right", fontWeight: 600 }}>
              {formatCurrency(item.price, currency)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Totals row — subtotal, tax, delivery fee, tip, total.
 */
export function OrderTotals({
  subtotal, taxAmount, deliveryFee, tip, discount, total,
  currency = "usd",
  taxLabel = "Tax",
  savedDeliveryFee,
}: {
  subtotal: number;
  taxAmount?: number;
  deliveryFee?: number;
  tip?: number;
  discount?: number;
  total: number;
  currency?: string;
  taxLabel?: string;
  /** When set + > 0, the customer earned free delivery via a promo.
   *  Render the line as "FREE (was $X)" instead of "$0.00" so the
   *  savings are visible inline. */
  savedDeliveryFee?: number;
}) {
  const row = (label: string, amount: number, bold = false) => (
    <Row>
      <Column style={{ fontSize: 14, color: bold ? COLORS.text : COLORS.muted, padding: "4px 0", fontWeight: bold ? 700 : 400 }}>
        {label}
      </Column>
      <Column style={{ fontSize: 14, textAlign: "right", color: bold ? COLORS.text : COLORS.muted, padding: "4px 0", fontWeight: bold ? 700 : 600 }}>
        {formatCurrency(amount, currency)}
      </Column>
    </Row>
  );
  return (
    <Section style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
      {row("Subtotal", subtotal)}
      {/* Delivery row: when a free-delivery promo fired, show the strike-
          through ORIGINAL fee + "FREE" so the savings are unmissable. */}
      {!!savedDeliveryFee && savedDeliveryFee > 0 ? (
        <Row>
          <Column style={{ fontSize: 14, color: COLORS.muted, padding: "4px 0", fontWeight: 400 }}>
            Delivery fee
          </Column>
          <Column style={{ fontSize: 14, textAlign: "right", padding: "4px 0" }}>
            <span style={{ textDecoration: "line-through", color: "#9ca3af", marginRight: 6 }}>
              {formatCurrency(savedDeliveryFee, currency)}
            </span>
            <span style={{ color: "#059669", fontWeight: 700 }}>FREE</span>
          </Column>
        </Row>
      ) : (
        !!deliveryFee && deliveryFee > 0 && row("Delivery fee", deliveryFee)
      )}
      {!!tip && tip > 0 && row("Tip", tip)}
      {!!discount && discount > 0 && row("Promo discount", -discount)}
      {!!taxAmount && taxAmount > 0 && row(taxLabel, taxAmount)}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6 }}>
        {row("Total", total, true)}
      </div>
    </Section>
  );
}

/**
 * Stat card — used in digest emails for "Sales / Orders / Avg order
 * value / Reservations." Big number, label, optional delta-vs-previous
 * arrow indicator.
 */
export function StatCard({
  label, value, delta, deltaDirection,
}: {
  label: string;
  value: string;
  /** Like "+12%" or "−8%" */
  delta?: string;
  /** Drives the delta color. "up" = good (emerald), "down" = bad (rose). */
  deltaDirection?: "up" | "down" | "flat";
}) {
  const deltaColor =
    deltaDirection === "up" ? "#059669" :
    deltaDirection === "down" ? "#e11d48" :
    COLORS.muted;
  return (
    <div
      style={{
        background: "#f9fafb",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, lineHeight: 1.1 }}>
          {value}
        </span>
        {delta && (
          <span style={{ fontSize: 13, fontWeight: 600, color: deltaColor }}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * 2x2 grid of StatCards (or 1x2 if you only pass 2). Wraps in a table
 * for Outlook compatibility. Each cell takes 50% width.
 */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const cells = Array.isArray(children) ? children : [children];
  // Render as table rows of 2 columns each.
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push([cells[i], cells[i + 1]]);
  }
  return (
    <table cellPadding={0} cellSpacing={0} border={0} width="100%" style={{ borderCollapse: "separate", borderSpacing: 10, margin: "8px -10px" }}>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j} width="50%" style={{ verticalAlign: "top" }}>
                {cell ?? null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Horizontal divider. Use sparingly — most layouts use the natural
 * padding between sections instead.
 */
export function Divider() {
  return <Hr style={{ borderColor: COLORS.border, margin: "20px 0" }} />;
}
