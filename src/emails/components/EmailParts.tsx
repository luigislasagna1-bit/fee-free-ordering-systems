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
import { COLORS, textStart, textEnd, padSide, marginSide, borderSide } from "./EmailLayout";
import { formatCurrency } from "@/lib/utils";

// A `locale` prop on the blocks below does NOT localize anything — every label
// still arrives pre-translated from the caller. It exists solely to mirror the
// hardcoded PHYSICAL layout values (text-align, padding-left, border-left,
// margin-right, align="right") for Arabic and Hebrew. `dir="rtl"` on <html>
// flips a table's column order but leaves those pinned to the wrong edge, and
// email clients can't use logical properties (see textStart/textEnd). Omitting
// it resolves LTR, i.e. exactly today's output.

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
  /** UNIT price. Do NOT render this beside the quantity — see lineTotal. */
  price: number;
  /** What this line actually costs (unit x qty, modifiers included). The Price
   *  column shows THIS, so the item lines reconcile to the Subtotal and match
   *  the printed ticket. Optional for older callers, which fall back to
   *  price x quantity. Luigi 2026-07-31. */
  lineTotal?: number;
  /** Per-item refundable deposit (untaxed) — shown as a "+ $X refundable deposit"
   *  line under the item so the breakdown reconciles to the Total. Luigi 2026-07-09. */
  isRefundableDeposit?: boolean;
  depositAmount?: number;
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
  items, currency = "usd", qtyLabel, itemsLabel, priceLabel, noteLabel, depositLabel, locale,
}: {
  items: EmailOrderItem[];
  currency?: string;
  /** Recipient locale — mirrors the physical alignment/indent values for RTL. */
  locale?: string | null;
  /** Localized "Refundable deposit" word for the per-item deposit line. */
  depositLabel?: string;
  // Column headers + the per-line "Note" label. Optional so the kitchen/staff
  // email (intentionally English) can omit them; the customer receipt passes
  // localized values from receipt.customer.*. Fall back to English.
  qtyLabel?: string;
  itemsLabel?: string;
  priceLabel?: string;
  noteLabel?: string;
}) {
  const start = textStart(locale);
  const end = textEnd(locale);
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
              textAlign: start,
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
            {qtyLabel ?? "Qty"}
          </th>
          <th
            style={{
              textAlign: start,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: COLORS.muted,
              padding: "8px 0",
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            {itemsLabel ?? "Items"}
          </th>
          <th
            style={{
              textAlign: end,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: COLORS.muted,
              padding: "8px 0",
              borderBottom: `1px solid ${COLORS.border}`,
            }}
          >
            {priceLabel ?? "Price"}
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
                <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4, ...padSide(start, 10), ...borderSide(start, `2px solid ${COLORS.border}`) }}>
                  {item.bundleItems.map((child, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>
                      <div style={{ color: COLORS.text }}>
                        • {child.name}{child.variantName ? ` (${child.variantName})` : ""}
                      </div>
                      {child.modifiers && child.modifiers.length > 0 && (
                        <div style={{ ...padSide(start, 10) }}>
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
                  {noteLabel ?? "Note"}: {item.notes}
                </div>
              )}
              {item.isRefundableDeposit && (item.depositAmount ?? 0) > 0 && (
                <div style={{ fontSize: 13, color: "#6d28d9", marginTop: 4 }}>
                  + {formatCurrency(item.depositAmount ?? 0, currency)} {depositLabel ?? "refundable deposit"}
                </div>
              )}
            </td>
            <td style={{ padding: "10px 0", color: COLORS.text, textAlign: end, fontWeight: 600 }}>
              {formatCurrency(item.lineTotal ?? item.price * (item.quantity ?? 1), currency)}
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
  serviceFees,
  depositTotal, depositTotalLabel,
  currency = "usd",
  taxLabel = "Tax",
  savedDeliveryFee,
  rewardUsed, rewardUsedLabel,
  rewardEarned, rewardEarnedLabel,
  balanceDue, balanceDueLabel,
  paymentLabel, paymentValue,
  subtotalLabel, deliveryFeeLabel, tipLabel, discountLabel, totalLabel, freeLabel,
  discountBreakdown,
  locale,
}: {
  /** Recipient locale — mirrors the physical amount-column alignment for RTL. */
  locale?: string | null;
  subtotal: number;
  taxAmount?: number;
  deliveryFee?: number;
  tip?: number;
  discount?: number;
  total: number;
  /** Per-order service/other fees ([{name, amount}], parsed by the caller) —
   *  each rendered by NAME so the rows reconcile to Total on fee-bearing
   *  stores (the GOLDEN receipt + web surfaces already do; audit 2026-07-11). */
  serviceFees?: Array<{ name?: string; amount?: number }>;
  /** Sum of per-item refundable deposits (untaxed) — shown as its own row so the
   *  breakdown reconciles to the Total, which already includes it. Luigi 2026-07-09. */
  depositTotal?: number;
  depositTotalLabel?: string;
  currency?: string;
  taxLabel?: string;
  /** When set + > 0, the customer earned free delivery via a promo.
   *  Render the line as "FREE (was $X)" instead of "$0.00" so the
   *  savings are visible inline. */
  savedDeliveryFee?: number;
  /** Store credit (Reward Dollars / "Pizza Bucks") applied as PAYMENT on this
   *  order — rendered green with a minus AFTER Total, followed by the bold
   *  balance row, so the email matches the confirmation page/receipt exactly
   *  (Luigi 2026-07-02: staff were reading Total and over-collecting).
   *  Callers pass the RESOLVED label ("Paid with Pizza Bucks" — localized for
   *  customer emails, English for staff). Both rows skipped when unset/0. */
  rewardUsed?: number;
  rewardUsedLabel?: string;
  /** Reward Dollars the customer WILL EARN on this order (projected — credited
   *  at completion) — rendered green with a plus after the balance block, same
   *  as the confirmation/status pages and the printed receipt. Caller resolves
   *  the localized label ("You earned {label}"). Skipped when unset/0. */
  rewardEarned?: number;
  rewardEarnedLabel?: string;
  /** Total − rewardUsed. Label = "Balance to pay"/"Paid" (customer) or
   *  "To collect"/"Collected" (staff) — resolved by the caller. */
  balanceDue?: number;
  balanceDueLabel?: string;
  /** Payment method line ("Payment" · "Cash on pickup"). Both caller-resolved. */
  paymentLabel?: string;
  paymentValue?: string;
  /** Row labels — CUSTOMER emails pass localized text (receipt.customer.*);
   *  STAFF emails omit them and keep the English defaults (staff bodies are
   *  English-only by design). Luigi 2026-07-02. */
  subtotalLabel?: string;
  deliveryFeeLabel?: string;
  tipLabel?: string;
  discountLabel?: string;
  totalLabel?: string;
  freeLabel?: string;
  /** The individual promos behind `discount`, so the breakdown names each
   *  special instead of lumping them into one line (Luigi 2026-08-11). Promo
   *  NAMES are owner-authored data, not UI copy, so they need no i18n — the
   *  fallback label does. free_delivery must NOT appear here: its saving lives
   *  on the delivery row as "FREE (was $X)". Anything the named rows don't
   *  cover still renders on the generic line, so the column always reconciles. */
  discountBreakdown?: Array<{ name?: string; amount?: number; couponCode?: string }>;
}) {
  const end = textEnd(locale);
  const row = (label: string, amount: number, bold = false) => (
    <Row>
      <Column style={{ fontSize: 14, color: bold ? COLORS.text : COLORS.muted, padding: "4px 0", fontWeight: bold ? 700 : 400 }}>
        {label}
      </Column>
      <Column style={{ fontSize: 14, textAlign: end, color: bold ? COLORS.text : COLORS.muted, padding: "4px 0", fontWeight: bold ? 700 : 600 }}>
        {formatCurrency(amount, currency)}
      </Column>
    </Row>
  );
  const showReward = !!rewardUsed && rewardUsed > 0;
  return (
    <Section style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
      {row(subtotalLabel ?? "Subtotal", subtotal)}
      {/* Delivery row: when a free-delivery promo fired, show the strike-
          through ORIGINAL fee + "FREE" so the savings are unmissable. */}
      {!!savedDeliveryFee && savedDeliveryFee > 0 ? (
        <Row>
          <Column style={{ fontSize: 14, color: COLORS.muted, padding: "4px 0", fontWeight: 400 }}>
            {deliveryFeeLabel ?? "Delivery fee"}
          </Column>
          <Column style={{ fontSize: 14, textAlign: end, padding: "4px 0" }}>
            <span style={{ textDecoration: "line-through", color: "#9ca3af", ...marginSide(end, 6) }}>
              {formatCurrency(savedDeliveryFee, currency)}
            </span>
            <span style={{ color: "#059669", fontWeight: 700 }}>{freeLabel ?? "FREE"}</span>
          </Column>
        </Row>
      ) : (
        !!deliveryFee && deliveryFee > 0 && row(deliveryFeeLabel ?? "Delivery fee", deliveryFee)
      )}
      {/* Service/other fees by name — position mirrors the web surfaces
          (after delivery, before tax). Dynamic names, no i18n. */}
      {(serviceFees ?? [])
        .filter((f) => f && Number(f.amount ?? 0) !== 0)
        .map((f, i) => (
          <Row key={`fee-${i}`}>
            <Column style={{ fontSize: 14, color: COLORS.muted, padding: "4px 0", fontWeight: 400 }}>
              {f.name ?? ""}
            </Column>
            <Column style={{ fontSize: 14, textAlign: end, color: COLORS.muted, padding: "4px 0", fontWeight: 600 }}>
              {formatCurrency(Number(f.amount), currency)}
            </Column>
          </Row>
        ))}
      {!!tip && tip > 0 && row(tipLabel ?? "Tip", tip)}
      {/* ── Discount, itemised by promo ───────────────────────────────────────
          Luigi 2026-08-11: a staff email reading "Promo discount −$37.01" gave
          the kitchen no way to see WHICH specials a customer had used. Each
          named promo now gets its own green row, in the same shape the service
          fees above already use.

          Reconciliation is the rule here: the rows must still add up to Total.
          So whatever the named promos don't account for (a manual coupon, a
          legacy order with no snapshot) is rendered as the remainder on the
          original generic line. Nothing is ever dropped, and an order with no
          snapshot at all falls straight through to the old single row. */}
      {(() => {
        const named = (discountBreakdown ?? []).filter((d) => d && Number(d.amount ?? 0) > 0);
        const total = Number(discount ?? 0);
        if (total <= 0) return null;
        const namedSum = named.reduce((s, d) => s + Number(d.amount), 0);
        // Half a cent of tolerance — float noise must not mint a phantom row.
        const remainder = Math.round((total - namedSum) * 100) / 100;
        return (
          <>
            {named.map((d, i) => (
              <Row key={`promo-${i}`}>
                <Column style={{ fontSize: 14, color: "#047857", padding: "4px 0", fontWeight: 400 }}>
                  {d.name || (discountLabel ?? "Promo discount")}
                  {d.couponCode ? ` (${d.couponCode})` : ""}
                </Column>
                <Column style={{ fontSize: 14, textAlign: "right", color: "#047857", padding: "4px 0", fontWeight: 600 }}>
                  {formatCurrency(-Number(d.amount), currency)}
                </Column>
              </Row>
            ))}
            {remainder > 0.005 && row(discountLabel ?? "Promo discount", -remainder)}
          </>
        );
      })()}
      {!!taxAmount && taxAmount > 0 && row(taxLabel, taxAmount)}
      {!!depositTotal && depositTotal > 0 && (
        <Row>
          <Column style={{ fontSize: 14, color: "#6d28d9", padding: "4px 0", fontWeight: 400 }}>
            {depositTotalLabel ?? "Refundable deposit (not taxed)"}
          </Column>
          <Column style={{ fontSize: 14, textAlign: end, color: "#6d28d9", padding: "4px 0", fontWeight: 600 }}>
            {formatCurrency(depositTotal, currency)}
          </Column>
        </Row>
      )}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6 }}>
        {row(totalLabel ?? "Total", total, true)}
      </div>
      {showReward && (
        <Row>
          <Column style={{ fontSize: 14, color: "#047857", padding: "4px 0", fontWeight: 600 }}>
            {rewardUsedLabel ?? "Paid with credit"}
          </Column>
          <Column style={{ fontSize: 14, textAlign: end, color: "#047857", padding: "4px 0", fontWeight: 700 }}>
            − {formatCurrency(rewardUsed!, currency)}
          </Column>
        </Row>
      )}
      {showReward && balanceDue != null && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 6, paddingTop: 6 }}>
          {row(balanceDueLabel ?? "Balance to pay", balanceDue, true)}
        </div>
      )}
      {!!rewardEarned && rewardEarned > 0 && (
        <Row>
          <Column style={{ fontSize: 14, color: "#059669", padding: "4px 0", fontWeight: 600 }}>
            {rewardEarnedLabel ?? "You earned credit"}
          </Column>
          <Column style={{ fontSize: 14, textAlign: end, color: "#059669", padding: "4px 0", fontWeight: 700 }}>
            + {formatCurrency(rewardEarned, currency)}
          </Column>
        </Row>
      )}
      {paymentValue && (
        <Row>
          <Column style={{ fontSize: 13, color: COLORS.muted, padding: "4px 0" }}>
            {paymentLabel ?? "Payment"}
          </Column>
          <Column style={{ fontSize: 13, textAlign: end, color: COLORS.muted, padding: "4px 0", fontWeight: 600 }}>
            {paymentValue}
          </Column>
        </Row>
      )}
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

/**
 * The order's timing facts, shown the same way on EVERY order email.
 *
 * Luigi 2026-08-07, matching the GloriaFood layout he uses as the benchmark:
 * an accepted-order email there states the fulfilment time right under the
 * order type ("45 minutes" for ASAP, or the booked slot for a future order) and
 * the acceptance moment at the bottom. Ours showed these inconsistently — the
 * placement time was never stated at all, and a SCHEDULED order could be
 * mistaken for an ASAP one, which is how a restaurant ends up cooking a
 * next-day order immediately.
 *
 * Every value arrives PRE-FORMATTED. Senders own formatting because that is
 * where the restaurant's timezone, 12h/24h preference and the recipient's
 * locale live — the same convention the rest of these templates follow.
 * Rows with no value are skipped, so an email that legitimately lacks a prep
 * time simply shows fewer lines rather than an empty one.
 */
export function TimingBlock({
  rows,
  scheduledBadge,
  locale,
}: {
  rows: Array<{ label: string; value?: string | null; emphasis?: boolean }>;
  /** When set, a prominent banner marks this as a FUTURE order. */
  scheduledBadge?: string | null;
  /** Recipient locale — mirrors the physical value-column alignment for RTL. */
  locale?: string | null;
}) {
  const end = textEnd(locale);
  const shown = rows.filter((r) => !!r.value);
  if (shown.length === 0 && !scheduledBadge) return null;
  return (
    <div
      style={{
        border: `1px solid ${scheduledBadge ? "#bae6fd" : COLORS.border}`,
        borderRadius: 8,
        overflow: "hidden",
        margin: "0 0 16px",
      }}
    >
      {scheduledBadge && (
        <div
          style={{
            background: "#e0f2fe",
            color: "#075985",
            fontSize: 13,
            fontWeight: 700,
            padding: "8px 14px",
            borderBottom: "1px solid #bae6fd",
          }}
        >
          {scheduledBadge}
        </div>
      )}
      <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={{ borderCollapse: "collapse" }}>
        <tbody>
          {shown.map((r, i) => (
            <tr key={r.label}>
              <td
                style={{
                  fontSize: 13,
                  color: COLORS.muted,
                  padding: "8px 14px",
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}`,
                  whiteSpace: "nowrap",
                }}
              >
                {r.label}
              </td>
              <td
                align={end}
                style={{
                  fontSize: 14,
                  color: COLORS.text,
                  fontWeight: r.emphasis ? 700 : 500,
                  padding: "8px 14px",
                  borderTop: i === 0 ? "none" : `1px solid ${COLORS.border}`,
                }}
              >
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
