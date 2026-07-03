/**
 * Restaurant-facing new-order notification email.
 *
 * GloriaFood-inspired (the "Luigi's Lasagna - MILTON - Order #..." example):
 *   - Dark navy header with restaurant name + order number
 *   - Two big stats up front: order type + total (paid status)
 *   - Customer contact line (name, phone, email)
 *   - Full itemized order with modifiers + customer notes
 *   - Subtotal + tax + total
 *   - CTA to view in admin dashboard
 *
 * Sent to: restaurant's notification recipients
 * Triggered by: new order placed (BEFORE acceptance) — this is the "you
 * have a new order" ping to the kitchen.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { formatCurrency } from "@/lib/utils";
import {
  EmailBody, P, EmailButton, Badge,
  OrderItemsTable, OrderTotals, EmailOrderItem, InfoCard,
} from "../components/EmailParts";

export type KitchenNotificationProps = {
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  orderType?: string;
  estimatedMinutes?: number;
  paidOnline?: boolean;
  /** Reserve-then-order: the table booking attached to this order. When set,
   *  the store email flags "Table reserved for N — <date> <time>". */
  reservationPartySize?: number | null;
  reservationLabel?: string | null;
  /** Full itemized order. Optional — older call sites that don't have items
   *  pass `total` only; the template degrades to a "View order in admin"
   *  prompt instead of rendering an empty table. */
  items?: EmailOrderItem[];
  subtotal?: number;
  taxAmount?: number;
  taxLabel?: string;
  deliveryFee?: number;
  tip?: number;
  discount?: number;
  total: number;
  deliveryAddress?: string | null;
  customerNotes?: string | null;
  dashboardUrl: string;
  imprint?: string;
  currency?: string;
  /** Reward Dollars (store credit) the customer paid with — when > 0 the
   *  totals add "Paid with {rewardLabel} −$X" + a bold "To collect"/
   *  "Collected" row so staff never read the Total and over-collect
   *  (Luigi 2026-07-02). Only sent when the rewards program is ON. */
  creditApplied?: number;
  rewardLabel?: string | null;
  /** Headline shown in the header subtitle + the lead badge. Defaults to
   *  "New order" (the placement ping). The acceptance/confirmation email
   *  passes a localized "Order confirmed" so staff can tell a confirmation
   *  apart from a brand-new order at a glance. */
  headline?: string;
};

const ORDER_TYPE_LABEL: Record<string, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  dine_in: "Dine-In",
  takeout: "Pickup",
  curbside: "Curbside",
};

export default function KitchenNotification(props: KitchenNotificationProps) {
  const {
    restaurantName, orderNumber, customerName, customerPhone, customerEmail,
    orderType, estimatedMinutes, paidOnline, reservationPartySize, reservationLabel, items, subtotal, taxAmount,
    taxLabel, deliveryFee, tip, discount, total, deliveryAddress,
    customerNotes, dashboardUrl, imprint, currency, headline,
    creditApplied, rewardLabel,
  } = props;
  const leadLabel = headline ?? "New order";
  const orderTypeLabel = orderType ? (ORDER_TYPE_LABEL[orderType] ?? orderType) : null;
  const hasItems = items && items.length > 0;
  // Store-credit part-payment → what staff actually collect. Staff email
  // bodies are English-only by design (subjects are localized).
  const rewardUsed = Math.max(0, Number(creditApplied ?? 0));
  const toCollect = Math.round(Math.max(0, total - rewardUsed) * 100) / 100;
  const rewardName = rewardLabel?.trim() || "credit";
  const collectLabel = paidOnline ? "Collected" : "To collect";

  return (
    <EmailLayout preview={`${restaurantName} — Order #${orderNumber} — ${formatCurrency(total, currency ?? "usd")}`}>
      <EmailHeader
        variant="transactional"
        title={`${restaurantName} — Order #${orderNumber}`}
        subtitle={`${leadLabel}${orderTypeLabel ? ` · ${orderTypeLabel}` : ""}${estimatedMinutes ? ` · ${estimatedMinutes} min` : ""}`}
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{leadLabel}</Badge>{" "}
          {orderTypeLabel && <><Badge color="slate">{orderTypeLabel}</Badge>{" "}</>}
          {typeof paidOnline === "boolean" && (
            <Badge color={paidOnline ? "sky" : "amber"}>
              {paidOnline ? "Paid online" : "Pay at store"}
            </Badge>
          )}
        </div>

        {/* Reserve-then-order: flag the table booking right at the top so the
            store sees "table reservation + pre-order". */}
        {reservationLabel && reservationPartySize != null && (
          <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: 8, background: "#f3e8ff", border: "1px solid #e9d5ff" }}>
            <strong style={{ color: "#6b21a8" }}>
              🪑 Table reservation + pre-order — {reservationPartySize} {reservationPartySize === 1 ? "guest" : "guests"}, {reservationLabel}
            </strong>
          </div>
        )}

        {/* Customer contact block */}
        <div style={{ margin: "0 0 6px" }}>
          <strong style={{ fontSize: 16 }}>{customerName}</strong>
        </div>
        {customerPhone && (
          <div style={{ fontSize: 14, marginBottom: 2 }}>
            <a href={`tel:${customerPhone.replace(/[^0-9+]/g, "")}`} style={{ color: "#059669", textDecoration: "none" }}>
              {customerPhone}
            </a>
          </div>
        )}
        {customerEmail && (
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            <a href={`mailto:${customerEmail}`} style={{ color: "#059669", textDecoration: "none" }}>
              {customerEmail}
            </a>
          </div>
        )}

        {orderType === "delivery" && deliveryAddress && (
          <InfoCard label="Delivery address" accent="emerald">
            {deliveryAddress}
          </InfoCard>
        )}

        {customerNotes && (
          <InfoCard label="Customer notes" accent="amber">
            {customerNotes}
          </InfoCard>
        )}

        {hasItems ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginTop: 20, marginBottom: 4 }}>
              Order details
            </div>
            <OrderItemsTable items={items!} currency={currency ?? "usd"} />
            <OrderTotals
              subtotal={subtotal ?? total}
              taxAmount={taxAmount}
              taxLabel={taxLabel}
              deliveryFee={deliveryFee}
              tip={tip}
              discount={discount}
              total={total}
              currency={currency ?? "usd"}
              rewardUsed={rewardUsed}
              rewardUsedLabel={`Paid with ${rewardName}`}
              balanceDue={toCollect}
              balanceDueLabel={collectLabel}
            />
          </>
        ) : (
          // Fallback: caller didn't pass items (legacy senders + the
          // acceptance/confirmation email). Show the total — and when store
          // credit part-paid, the amount actually collected — then direct
          // them to the admin for the full breakdown.
          <InfoCard label={rewardUsed > 0 ? collectLabel : "Order total"} accent="slate">
            <strong style={{ fontSize: 18 }}>{formatCurrency(rewardUsed > 0 ? toCollect : total, currency ?? "usd")}</strong>
            {rewardUsed > 0 && (
              <div style={{ fontSize: 13, color: "#047857", marginTop: 4, fontWeight: 600 }}>
                Order total {formatCurrency(total, currency ?? "usd")} − {formatCurrency(rewardUsed, currency ?? "usd")} paid with {rewardName}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              See itemized breakdown in the admin dashboard.
            </div>
          </InfoCard>
        )}

        <EmailButton href={dashboardUrl}>Open Kitchen Order App</EmailButton>

        <P size="sm" muted>
          Accept this order from the Kitchen Order App or the admin dashboard. Auto-reject runs if no action is taken within your configured timeout.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
