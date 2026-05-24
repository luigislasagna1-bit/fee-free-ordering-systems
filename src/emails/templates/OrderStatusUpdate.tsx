/**
 * Customer-facing order status update.
 *
 * Sent when the order transitions to a customer-visible status:
 *   - "accepted"   — kitchen took it (matches OrderConfirmation but shorter
 *                    — confirmation is the heavyweight version)
 *   - "preparing"  — cooking started
 *   - "ready"      — pickup ready / out for delivery
 *   - "completed"  — delivered / picked up
 *
 * Visual: emerald status header, single big "what's happening" line,
 * tracking CTA, restaurant signature.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, Badge } from "../components/EmailParts";

export type OrderStatusUpdateProps = {
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  status: string;       // "accepted" | "preparing" | "ready" | "completed"
  /** Optional human-friendly status sentence — overrides the default for the status. */
  statusMessage?: string;
  trackingUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

const STATUS_COPY: Record<string, { title: string; body: string; badge: string }> = {
  accepted:  { title: "Your order is accepted",   body: "We've received your order and the kitchen has started preparing it.", badge: "Accepted" },
  preparing: { title: "Your order is being made", body: "The kitchen is hard at work on your order right now.",               badge: "Preparing" },
  ready:     { title: "Your order is ready!",     body: "Your order is ready. Please pick it up — or it's now out for delivery.", badge: "Ready" },
  completed: { title: "Your order is complete",   body: "Thanks for ordering with us. We hope to see you again soon!",        badge: "Completed" },
};

export default function OrderStatusUpdate(props: OrderStatusUpdateProps) {
  const {
    customerName, orderNumber, restaurantName, status, statusMessage,
    trackingUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;
  const copy = STATUS_COPY[status] ?? { title: "Order update", body: statusMessage ?? "Your order status has changed.", badge: status };

  return (
    <EmailLayout preview={`Order #${orderNumber} — ${copy.title}`}>
      <EmailHeader variant="status" title={copy.title} subtitle={`Order #${orderNumber}`} />
      <EmailBody>
        <P>Hello {customerName},</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{copy.badge}</Badge>
        </div>
        <P>{statusMessage ?? copy.body}</P>
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
