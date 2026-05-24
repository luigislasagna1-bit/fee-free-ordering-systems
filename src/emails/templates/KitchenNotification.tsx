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
    orderType, estimatedMinutes, paidOnline, items, subtotal, taxAmount,
    taxLabel, deliveryFee, tip, discount, total, deliveryAddress,
    customerNotes, dashboardUrl, imprint, currency,
  } = props;
  const orderTypeLabel = orderType ? (ORDER_TYPE_LABEL[orderType] ?? orderType) : null;
  const hasItems = items && items.length > 0;

  return (
    <EmailLayout preview={`${restaurantName} — Order #${orderNumber} — ${currency ?? "$"}${total.toFixed(2)}`}>
      <EmailHeader
        variant="transactional"
        title={`${restaurantName} — Order #${orderNumber}`}
        subtitle={`New order${orderTypeLabel ? ` · ${orderTypeLabel}` : ""}${estimatedMinutes ? ` · ${estimatedMinutes} min` : ""}`}
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">New order</Badge>{" "}
          {orderTypeLabel && <><Badge color="slate">{orderTypeLabel}</Badge>{" "}</>}
          {typeof paidOnline === "boolean" && (
            <Badge color={paidOnline ? "sky" : "amber"}>
              {paidOnline ? "Paid online" : "Pay at store"}
            </Badge>
          )}
        </div>

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
            <OrderItemsTable items={items!} currency={currency ?? "$"} />
            <OrderTotals
              subtotal={subtotal ?? total}
              taxAmount={taxAmount}
              taxLabel={taxLabel}
              deliveryFee={deliveryFee}
              tip={tip}
              discount={discount}
              total={total}
              currency={currency ?? "$"}
            />
          </>
        ) : (
          // Fallback: caller didn't pass items (legacy senders). Show just
          // the total and direct them to the admin for the breakdown.
          <InfoCard label="Order total" accent="slate">
            <strong style={{ fontSize: 18 }}>{currency ?? "$"}{total.toFixed(2)}</strong>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              See itemized breakdown in the admin dashboard.
            </div>
          </InfoCard>
        )}

        <EmailButton href={dashboardUrl}>Open kitchen display</EmailButton>

        <P size="sm" muted>
          Accept this order from the kitchen display app or the admin dashboard. Auto-reject runs if no action is taken within your configured timeout.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
