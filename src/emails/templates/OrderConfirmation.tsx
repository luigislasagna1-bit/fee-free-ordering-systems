/**
 * Customer-facing "Order Received" email.
 *
 * Fires immediately when the customer places an order (or when the card
 * payment intent succeeds). At this point the restaurant has NOT yet
 * accepted the order — so the copy must be careful: we tell the customer
 * we have their order and the restaurant will confirm shortly. The actual
 * confirmation email (with locked-in prep time) is the OrderStatusUpdate
 * email fired when the kitchen flips status → "accepted".
 *
 * This was historically named OrderConfirmation and titled "Order confirmed",
 * which produced the confusing flow: customer got "Order confirmed" at
 * placement, then "Order rejected" if the kitchen declined — two contradictory
 * emails. Now the placement email says "received / awaiting confirmation"
 * and the kitchen-accept email is the real confirmation.
 *
 * Layout: emerald status header, awaiting-confirmation messaging, itemized
 * receipt, totals breakdown, delivery address (if delivery), tracking CTA.
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
  const timeLabel = orderType === "delivery" ? "Estimated delivery" : "Estimated ready";

  return (
    <EmailLayout preview={`Order #${orderNumber} received — awaiting restaurant confirmation`}>
      <EmailHeader
        variant="status"
        title="Order received"
        subtitle="Awaiting restaurant confirmation"
      />
      <EmailBody>
        <P>Hello {customerName},</P>
        <P>
          Thanks for your order at <strong>{restaurantName}</strong>! We&apos;ve
          received order <strong>#{orderNumber}</strong> and the restaurant
          will confirm it shortly. You&apos;ll get a follow-up email the moment
          they accept &mdash; with the final {timeLabel.toLowerCase()} time
          (currently estimated at <strong>{estimatedMinutes} min</strong>).
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
