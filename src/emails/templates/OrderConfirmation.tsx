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
import { formatCurrency } from "@/lib/utils";
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
  /** Promotions that fired for this order — rendered as a highlighted
   *  box above the totals so the customer sees the applied promo by
   *  name + the savings. Each entry: { name, type, discount,
   *  couponCode? }. Empty / undefined → box hidden. */
  appliedPromos?: Array<{
    name: string;
    type: string;
    discount: number;
    couponCode?: string;
  }>;
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
    appliedPromos,
  } = props;
  const cur = currency ?? "usd";
  const promoList = Array.isArray(appliedPromos) ? appliedPromos : [];
  // Pull the saved delivery fee off the free-delivery promo entry (if
  // one fired) so the totals block can render "Delivery fee: ~~$7.99~~ FREE".
  const freeDelivery = promoList.find((p) => p.type === "free_delivery");
  const savedDeliveryFee = freeDelivery ? freeDelivery.discount : 0;
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
        <OrderItemsTable items={items} currency={currency ?? "usd"} />

        {/* Promos applied — boxed highlight above totals (Phase 2 +
            Luigi feedback 2026-05-29). Skipped when nothing fired. */}
        {promoList.length > 0 && (
          <div
            style={{
              marginTop: 12,
              marginBottom: 4,
              padding: "12px 14px",
              border: "2px solid #a7f3d0",
              borderRadius: 10,
              background: "linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#065f46",
                marginBottom: 8,
              }}
            >
              🎉 Promos applied
            </div>
            {promoList.map((p, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 13,
                  marginBottom: i === promoList.length - 1 ? 0 : 4,
                }}
              >
                <span style={{ color: "#047857", fontWeight: 500 }}>
                  ✓ {p.name}
                  {p.couponCode && (
                    <span
                      style={{
                        fontFamily: "Courier, monospace",
                        background: "#fff",
                        border: "1px solid #a7f3d0",
                        color: "#047857",
                        padding: "1px 6px",
                        borderRadius: 4,
                        marginLeft: 6,
                        fontSize: 11,
                      }}
                    >
                      {p.couponCode}
                    </span>
                  )}
                </span>
                <span style={{ color: "#065f46", fontWeight: 700 }}>
                  {p.discount > 0 ? `− ${formatCurrency(p.discount, cur)}` : "FREE"}
                </span>
              </div>
            ))}
          </div>
        )}

        <OrderTotals
          subtotal={subtotal}
          taxAmount={taxAmount}
          taxLabel={taxLabel}
          deliveryFee={deliveryFee}
          savedDeliveryFee={savedDeliveryFee}
          tip={tip}
          discount={discount}
          total={total}
          currency={currency ?? "usd"}
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
