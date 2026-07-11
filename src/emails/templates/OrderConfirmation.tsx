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
import type { Translator } from "@/lib/i18n-dict";

export type OrderConfirmationProps = {
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  orderType: string;        // "delivery" | "pickup" | "dine_in" — capitalized in render
  paidOnline: boolean;
  estimatedMinutes: number;
  /** Pre-formatted scheduled slot (restaurant tz + customer locale). When set,
   *  the email shows an "order for later" line instead of the ASAP ETA. */
  scheduledLabel?: string | null;
  /** Reserve-then-order: when this order came with a table booking, these show
   *  a "Table reserved for N — <date> <time>" line so one email covers both. */
  reservationPartySize?: number | null;
  reservationLabel?: string | null;
  items: EmailOrderItem[];
  subtotal: number;
  taxAmount?: number;
  taxLabel?: string;
  deliveryFee?: number;
  tip?: number;
  depositTotal?: number;
  discount?: number;
  /** Per-order service/other fees (parsed [{name, amount}]) — named rows so
   *  the breakdown reconciles to Total on fee-bearing stores. 2026-07-11. */
  serviceFees?: Array<{ name?: string; amount?: number }>;
  total: number;
  /** Delivery address — only shown when orderType === "delivery". */
  deliveryAddress?: string | null;
  trackingUrl: string;
  // Restaurant signature
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
  /** Receipt-header logo URL (Restaurant.receiptLogoUrl). */
  logoUrl?: string;
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
  /** Reward Dollars (store credit) applied as PAYMENT — when > 0 the totals
   *  block adds "Paid with {rewardLabel} −$X" + "Balance to pay $Y" so the
   *  email matches the confirmation page to the cent (Luigi 2026-07-02).
   *  Only sent when the restaurant's rewards program is ON (feature-gated). */
  creditApplied?: number;
  rewardLabel?: string | null;
  /** RESOLVED localized payment-method text ("Cash on pickup") — the sender
   *  resolves it (it has the raw orderType; the template's is localized). */
  paymentValue?: string | null;
  /** Order.paymentStatus — "paid" flips the balance label to "Paid". */
  paidStatus?: string | null;
  t: Translator;
};

export default function OrderConfirmation(props: OrderConfirmationProps) {
  const {
    customerName, orderNumber, restaurantName, orderType, paidOnline,
    estimatedMinutes, scheduledLabel, reservationPartySize, reservationLabel, items, subtotal, taxAmount, taxLabel, deliveryFee, tip,
    depositTotal, discount, serviceFees, total, deliveryAddress, trackingUrl, restaurantUrl,
    restaurantEmail, restaurantPhone, imprint, logoUrl, currency,
    appliedPromos, creditApplied, rewardLabel, paymentValue, paidStatus, t,
  } = props;
  const cur = currency ?? "usd";
  // Reward Dollars part-payment rows — mirror the confirmation page exactly:
  // Total → "Paid with {label}" (green, minus) → bold "Balance to pay"/"Paid".
  // creditApplied only arrives when the restaurant's rewards program is ON.
  const rewardUsed = Math.max(0, Number(creditApplied ?? 0));
  const balanceDue = Math.round(Math.max(0, total - rewardUsed) * 100) / 100;
  const isPaid = paidOnline || (paidStatus ?? "").toLowerCase() === "paid";
  const rewardName = rewardLabel?.trim() || t("customer.confirmation.rewardDefaultName");
  const promoList = Array.isArray(appliedPromos) ? appliedPromos : [];
  // Pull the saved delivery fee off the free-delivery promo entry (if
  // one fired) so the totals block can render "Delivery fee: ~~$7.99~~ FREE".
  const freeDelivery = promoList.find((p) => p.type === "free_delivery");
  const savedDeliveryFee = freeDelivery ? freeDelivery.discount : 0;

  const ORDER_TYPE_LABEL: Record<string, string> = {
    delivery: t("email.orderConfirmed.orderTypeDelivery"),
    pickup: t("email.orderConfirmed.orderTypePickup"),
    dine_in: t("email.orderConfirmed.orderTypeDineIn"),
    takeout: t("email.orderConfirmed.orderTypePickup"),
    curbside: t("email.orderConfirmed.orderTypeCurbside"),
  };

  const orderTypeLabel = ORDER_TYPE_LABEL[orderType] ?? orderType;
  const timeLabel = orderType === "delivery"
    ? t("email.orderConfirmed.timeLabelDelivery")
    : t("email.orderConfirmed.timeLabelReady");

  return (
    <EmailLayout preview={t("email.orderConfirmed.preview", { orderNumber })}>
      <EmailHeader
        variant="status"
        title={t("email.orderConfirmed.headerTitle")}
        subtitle={t("email.orderConfirmed.headerSubtitle")}
      />
      <EmailBody>
        {logoUrl ? (
          // Receipt-header logo — table-wrapped + inline styles for email
          // client compatibility (no flex/max-w classes in email HTML).
          <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <td align="center">
                  <img src={logoUrl} alt="" width="160" style={{ display: "block", maxWidth: "160px", maxHeight: "90px", objectFit: "contain" }} />
                </td>
              </tr>
            </tbody>
          </table>
        ) : null}
        <P>{t("email.orderConfirmed.greeting", { customerName })}</P>
        <P>
          {t("email.orderConfirmed.bodyThanks", { restaurantName })}{" "}
          {t("email.orderConfirmed.bodyReceived", { orderNumber })}
          {scheduledLabel
            ? ""
            : " " + t("email.orderConfirmed.bodyFollowUp", { timeLabel: timeLabel.toLowerCase(), estimatedMinutes })}
        </P>

        {/* Prominent "order for later" line for scheduled orders. */}
        {scheduledLabel && (
          <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: 8, background: "#e0f2fe", border: "1px solid #bae6fd" }}>
            <strong style={{ color: "#075985" }}>
              {t("email.orderConfirmed.scheduledFor", { time: scheduledLabel })}
            </strong>
          </div>
        )}

        {/* Reserve-then-order: confirm the table booking in the SAME email. */}
        {reservationLabel && reservationPartySize != null && (
          <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: 8, background: "#f3e8ff", border: "1px solid #e9d5ff" }}>
            <strong style={{ color: "#6b21a8" }}>
              🪑 {t("email.orderConfirmed.tableReservation", { n: reservationPartySize, time: reservationLabel })}
            </strong>
          </div>
        )}

        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{orderTypeLabel}</Badge>{" "}
          <Badge color={paidOnline ? "sky" : "amber"}>
            {paidOnline
              ? t("email.orderConfirmed.badgePaidOnline")
              : t("email.orderConfirmed.badgePayAtStore")}
          </Badge>
        </div>

        {orderType === "delivery" && deliveryAddress && (
          <InfoCard label={t("email.orderConfirmed.deliveryAddressLabel")} accent="emerald">
            {deliveryAddress}
          </InfoCard>
        )}

        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginTop: 20, marginBottom: 4 }}>
          {t("email.orderConfirmed.orderDetailsSectionHeading")}
        </div>
        <OrderItemsTable
          items={items}
          currency={currency ?? "usd"}
          qtyLabel={t("receipt.customer.qty")}
          itemsLabel={t("receipt.customer.items")}
          priceLabel={t("receipt.customer.price")}
          noteLabel={t("receipt.customer.lineNote")}
          depositLabel={t("ordering.refundableDeposit")}
        />

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
              {t("email.orderConfirmed.promosAppliedHeading")}
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
                  {p.discount > 0 ? `− ${formatCurrency(p.discount, cur)}` : t("email.orderConfirmed.promoFreeLabel")}
                </span>
              </div>
            ))}
          </div>
        )}

        <OrderTotals
          subtotal={subtotal}
          taxAmount={taxAmount}
          taxLabel={taxLabel ?? t("receipt.customer.tax")}
          deliveryFee={deliveryFee}
          savedDeliveryFee={savedDeliveryFee}
          tip={tip}
          depositTotal={depositTotal}
          depositTotalLabel={t("ordering.refundableDepositNotTaxed")}
          discount={discount}
          serviceFees={serviceFees}
          total={total}
          currency={currency ?? "usd"}
          // Customer email → every row label localized (receipt.customer.*),
          // fixing the hardcoded-English totals block (Luigi 2026-07-02).
          subtotalLabel={t("receipt.customer.subtotal")}
          deliveryFeeLabel={t("receipt.customer.deliveryFee")}
          tipLabel={t("receipt.customer.tip")}
          discountLabel={t("receipt.customer.promoDiscount")}
          totalLabel={t("receipt.customer.total")}
          freeLabel={t("email.orderConfirmed.promoFreeLabel")}
          rewardUsed={rewardUsed}
          rewardUsedLabel={t("receipt.customer.paidWithReward", { label: rewardName })}
          balanceDue={balanceDue}
          balanceDueLabel={isPaid ? t("money.paid") : t("receipt.customer.balanceDue")}
          paymentLabel={t("checkout.paymentMethod")}
          paymentValue={paymentValue ?? undefined}
        />

        <EmailButton href={trackingUrl}>{t("email.orderConfirmed.trackOrderButton")}</EmailButton>

        <P size="sm" muted>
          {t("email.orderConfirmed.contactRestaurantNote")}
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
