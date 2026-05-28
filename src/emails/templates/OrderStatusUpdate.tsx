/**
 * Customer-facing order status update.
 *
 * Sent when the order transitions to a customer-visible status:
 *   - "accepted"   — kitchen took it. THIS is the real confirmation —
 *                    the prior placement-time email only says "received".
 *   - "preparing"  — cooking started
 *   - "ready"      — pickup ready / out for delivery
 *   - "completed"  — delivered / picked up
 *   - "rejected"   — kitchen declined. rejectionReason surfaces here.
 *   - "cancelled"  — restaurant cancelled after accepting.
 *
 * Visual: status-colored header (emerald for positive, rose for negative),
 * status badge, body copy, optional rejection-reason callout, tracking CTA.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, Badge, InfoCard } from "../components/EmailParts";

export type OrderStatusUpdateProps = {
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  status: string;
  /** Optional human-friendly status sentence — overrides the default for the status. */
  statusMessage?: string;
  /** Restaurant-supplied reason — shown in a callout when status is rejected/cancelled. */
  rejectionReason?: string;
  trackingUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

type StatusCopy = {
  title: string;
  body: string;
  badge: string;
  badgeColor: "emerald" | "amber" | "rose" | "sky";
  isNegative: boolean;
};

const STATUS_COPY: Record<string, StatusCopy> = {
  accepted:  {
    title: "Order confirmed",
    body: "Great news — the restaurant accepted your order and the kitchen is starting on it now.",
    badge: "Confirmed", badgeColor: "emerald", isNegative: false,
  },
  preparing: {
    title: "Your order is being made",
    body: "The kitchen is hard at work on your order right now.",
    badge: "Preparing", badgeColor: "emerald", isNegative: false,
  },
  ready: {
    title: "Your order is ready!",
    body: "Your order is ready. Please pick it up — or it's now out for delivery.",
    badge: "Ready", badgeColor: "emerald", isNegative: false,
  },
  completed: {
    title: "Your order is complete",
    body: "Thanks for ordering with us. We hope to see you again soon!",
    badge: "Completed", badgeColor: "emerald", isNegative: false,
  },
  rejected: {
    title: "Order not accepted",
    body: "Unfortunately the restaurant wasn't able to accept your order. If you paid online, any authorization will be released automatically — you won't be charged.",
    badge: "Not accepted", badgeColor: "rose", isNegative: true,
  },
  cancelled: {
    title: "Order cancelled",
    body: "The restaurant cancelled your order. If you paid online, a refund is on its way and should appear on your statement within a few business days.",
    badge: "Cancelled", badgeColor: "rose", isNegative: true,
  },
};

export default function OrderStatusUpdate(props: OrderStatusUpdateProps) {
  const {
    customerName, orderNumber, restaurantName, status, statusMessage, rejectionReason,
    trackingUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;
  const normalized = status.toLowerCase();
  // Map "canceled" (US) → "cancelled" (UK) so both spellings hit the same copy.
  const key = normalized === "canceled" ? "cancelled" : normalized;
  const copy: StatusCopy = STATUS_COPY[key] ?? {
    title: "Order update", body: statusMessage ?? "Your order status has changed.",
    badge: status, badgeColor: "sky", isNegative: false,
  };
  const reason = rejectionReason?.trim();

  return (
    <EmailLayout preview={`Order #${orderNumber} — ${copy.title}`}>
      <EmailHeader variant="status" title={copy.title} subtitle={`Order #${orderNumber}`} />
      <EmailBody>
        <P>Hello {customerName},</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color={copy.badgeColor}>{copy.badge}</Badge>
        </div>
        <P>{statusMessage ?? copy.body}</P>
        {copy.isNegative && reason && (
          <InfoCard label="Reason from the restaurant" accent="rose">
            {reason}
          </InfoCard>
        )}
        {!copy.isNegative && (
          <EmailButton href={trackingUrl}>View order status</EmailButton>
        )}
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
