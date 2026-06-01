/**
 * Customer-facing "order delayed" email.
 *
 * Fired from POST /api/orders/[id]/delay when the kitchen hits the
 * "+5 / +10 / +15 / Custom" button on the KDS order detail. Tells the
 * customer:
 *   - That their order is running behind
 *   - By how many minutes (so they can decide whether to wait)
 *   - The new estimated ready time (formatted in their browser locale
 *     at render — we ship a Date, the email client doesn't reformat)
 *   - Optionally, a short reason supplied by the kitchen
 *
 * Tone: apologetic but not panicky. The customer paid; they're allowed
 * to know things are slipping.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type OrderDelayedProps = {
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  /** New estimated ready time. Already bumped by delayMinutes when this template renders. */
  newEstimatedReady: Date;
  /** How many minutes the kitchen added on top of the previous ETA. */
  delayMinutes: number;
  /** Optional free-text reason ("kitchen running busy", "out of an ingredient"). */
  reason?: string | null;
  /** Tracking URL — same status page the rest of the order emails link to. */
  trackingUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function OrderDelayed(props: OrderDelayedProps) {
  const {
    customerName, orderNumber, restaurantName, newEstimatedReady, delayMinutes, reason,
    trackingUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;

  const etaLabel = newEstimatedReady.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <EmailLayout preview={`Order #${orderNumber} — running about ${delayMinutes} min behind`}>
      <EmailHeader
        variant="status"
        title="Your order is running a bit behind"
        subtitle={`Order #${orderNumber}`}
      />
      <EmailBody>
        <P>Hello {customerName},</P>
        <P>
          {restaurantName} let us know your order is running about{" "}
          <strong>{delayMinutes} {delayMinutes === 1 ? "minute" : "minutes"}</strong>{" "}
          behind schedule. The new estimated ready time is{" "}
          <strong>{etaLabel}</strong>.
        </P>
        {reason && (
          <InfoCard label="Note from the restaurant" accent="amber">
            {reason}
          </InfoCard>
        )}
        <P>
          Thanks for your patience — we&apos;ll let you know the moment it&apos;s ready.
        </P>
        <EmailButton href={trackingUrl}>View order status</EmailButton>
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
