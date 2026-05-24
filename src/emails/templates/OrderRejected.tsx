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
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function OrderRejected(props: OrderRejectedProps) {
  const { customerName, orderNumber, restaurantName, reason, paidOnline,
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
          <InfoCard label="Refund" accent="emerald">
            Your payment will be automatically refunded to the card you used. It typically takes <strong>5–10 business days</strong> to appear on your statement.
          </InfoCard>
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
