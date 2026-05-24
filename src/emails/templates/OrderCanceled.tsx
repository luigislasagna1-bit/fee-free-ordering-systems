/**
 * Customer-facing "your order was canceled" email.
 *
 * Sent when an order is canceled after acceptance — could be the restaurant
 * canceling (rare), the customer canceling, or the auto-cancel from a
 * Stripe dispute. Refund treatment same as rejection.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type OrderCanceledProps = {
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  reason?: string | null;
  paidOnline: boolean;
  imprint?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
};

export default function OrderCanceled(props: OrderCanceledProps) {
  const { customerName, orderNumber, restaurantName, reason, paidOnline,
    imprint, restaurantUrl, restaurantEmail, restaurantPhone } = props;
  return (
    <EmailLayout preview={`Order #${orderNumber} canceled`}>
      <EmailHeader
        variant="transactional"
        title="Order canceled"
        subtitle={`Order #${orderNumber}`}
      />
      <EmailBody>
        <P>Hello {customerName},</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="rose">Canceled</Badge>
        </div>
        <P>Your order at <strong>{restaurantName}</strong> has been canceled.</P>
        {reason && (
          <InfoCard label="Reason" accent="amber">
            {reason}
          </InfoCard>
        )}
        {paidOnline && (
          <InfoCard label="Refund" accent="emerald">
            A refund has been issued for the full amount. It typically takes <strong>5–10 business days</strong> to appear on your statement.
          </InfoCard>
        )}
        <P>If you have questions, please contact the restaurant directly using the details below.</P>
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
