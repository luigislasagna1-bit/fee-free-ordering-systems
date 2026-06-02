/**
 * Customer-facing "your order was rejected" email.
 *
 * Sent when the restaurant rejects an order. If the order was paid online,
 * the auto-refund cron has already started — we mention it here so the
 * customer knows the money is coming back.
 *
 * Visual: amber/slate header (not emerald — this is not a happy email).
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type OrderRejectedProps = {
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  reason?: string | null;
  /** True if the original payment was online — triggers the refund message. */
  paidOnline: boolean;
  /** True when the card was already captured (Stripe: paymentStatus="paid").
   *  Used to distinguish "your card was not charged" (auth-only, no capture)
   *  from "we'll refund you" (captured, money moved). Mirrors what
   *  GloriaFood writes in the same case (Fabrizio 2026-06-01 feedback). */
  paymentCaptured?: boolean;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function OrderRejected(props: OrderRejectedProps) {
  const { customerName, orderNumber, restaurantName, reason, paidOnline, paymentCaptured,
    restaurantUrl, restaurantEmail, restaurantPhone, imprint } = props;
  return (
    <EmailLayout preview={`Order #${orderNumber} could not be accepted`}>
      <EmailHeader
        variant="transactional"
        title="Order not accepted"
        subtitle={`Order #${orderNumber}`}
      />
      <EmailBody>
        <P>Hello {customerName},</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="rose">Rejected</Badge>
        </div>
        <P>
          We&apos;re sorry — <strong>{restaurantName}</strong> wasn&apos;t able to accept your order this time.
        </P>
        {reason && (
          <InfoCard label="Reason given by the restaurant" accent="amber">
            {reason}
          </InfoCard>
        )}
        {paidOnline && (
          paymentCaptured ? (
            <InfoCard label="Refund" accent="emerald">
              Your payment will be automatically refunded to the card you used. It typically takes <strong>5–10 business days</strong> to appear on your statement.
            </InfoCard>
          ) : (
            <InfoCard label="Payment" accent="emerald">
              <strong>Your card was not charged.</strong> The authorization hold on your card will drop off automatically within a few business days.
            </InfoCard>
          )
        )}
        {restaurantPhone && (
          <P>
            Questions? Call the restaurant directly:{" "}
            <a href={`tel:${restaurantPhone.replace(/[^0-9+]/g, "")}`} style={{ color: "#047857", fontWeight: 600 }}>
              {restaurantPhone}
            </a>
          </P>
        )}
        <P>We&apos;re sorry for the inconvenience. Try ordering again later, or reach out to the restaurant if you have questions.</P>
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
