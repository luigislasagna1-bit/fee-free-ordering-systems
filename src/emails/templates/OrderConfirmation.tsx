/**
 * Customer-facing order confirmation email.
 *
 * GloriaFood-inspired layout:
 *   - Emerald status header with order # + "Order confirmed" + delivery
 *     time prominently displayed (you saw the "Delivery time: 45 MIN"
 *     example — same vibe)
 *   - Greeting
 *   - Order-type / payment status badges
 *   - Itemized order table with modifiers
 *   - Subtotal / tax / total breakdown
 *   - Delivery address card (only for delivery orders)
 *   - Primary CTA "Track your order"
 *   - Restaurant signature footer (name / website / email / phone)
 *
 * Sent to: customer email
 * Triggered by: order accepted by restaurant kitchen
 */
import { EmailLayout, EmailHeader } from "../components/EmailLayout";
import {
  EmailBody, P, EmailButton, InfoCard, Badge,
  OrderItemsTable, OrderTotals, EmailOrderItem,
} from "../components/EmailParts";
import { EmailFooter } from "../components/EmailLayout";

export type OrderConfirmationProps = {
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  orderType: string;        // "delivery" | "pickup" | "dine_in" — capitalized in render
  paidOnline: boolean;
  estimatedMinutes: number;
  items: EmailOrderItem[];
  subtotal: number;
  taxAmount?: number;
  taxLabel?: string;
  deliveryFee?: number;
  tip?: number;
  discount?: number;
  total: number;
  /** Delivery address — only shown when orderType === "delivery". */
  deliveryAddress?: string | null;
  trackingUrl: string;
  // Restaurant signature
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
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

export default function OrderConfirmation(props: OrderConfirmationProps) {
  const {
    customerName, orderNumber, restaurantName, orderType, paidOnline,
    estimatedMinutes, items, subtotal, taxAmount, taxLabel, deliveryFee, tip,
    discount, total, deliveryAddress, trackingUrl, restaurantUrl,
    restaurantEmail, restaurantPhone, imprint, currency,
  } = props;
  const orderTypeLabel = ORDER_TYPE_LABEL[orderType] ?? orderType;
  const timeLabel = orderType === "delivery" ? "Delivery time" : "Ready in";

  return (
    <EmailLayout preview={`Order #${orderNumber} confirmed — ${timeLabel.toLowerCase()} ${estimatedMinutes} min`}>
      <EmailHeader
        variant="status"
        title="Order confirmed"
        subtitle={`${timeLabel}: ${estimatedMinutes} min`}
      />
      <EmailBody>
        <P>Hello {customerName},</P>
        <P>
          Thank you for your order at <strong>{restaurantName}</strong>!
          We are glad to confirm your order <strong>#{orderNumber}</strong>.
        </P>

        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{orderTypeLabel}</Badge>{" "}
          <Badge color={paidOnline ? "sky" : "amber"}>
            {paidOnline ? "Paid online" : "Pay at store"}
          </Badge>
        </div>

        {orderType === "delivery" && deliveryAddress && (
          <InfoCard label="Your delivery address" accent="emerald">
            {deliveryAddress}
          </InfoCard>
        )}

        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginTop: 20, marginBottom: 4 }}>
          Your order details
        </div>
        <OrderItemsTable items={items} currency={currency ?? "$"} />
        <OrderTotals
          subtotal={subtotal}
          taxAmount={taxAmount}
          taxLabel={taxLabel}
          deliveryFee={deliveryFee}
          tip={tip}
          discount={discount}
          total={total}
          currency={currency ?? "$"}
        />

        <EmailButton href={trackingUrl}>Track your order</EmailButton>

        <P size="sm" muted>
          If you have any questions about your order, please contact the restaurant directly using the details below.
        </P>
      </EmailBody>
      <EmailFooter
        restaurantName={restaurantName}
        restaurantUrl={restaurantUrl}
        restaurantEmail={restaurantEmail}
        restaurantPhone={restaurantPhone}
        imprint={imprint}
      />
    </EmailLayout>
  );
}
