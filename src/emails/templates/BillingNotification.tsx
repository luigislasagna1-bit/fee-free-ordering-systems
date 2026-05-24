/**
 * Restaurant-owner billing notification.
 *
 * Catch-all for billing-related events: payment received, payment failed,
 * subscription renewed, marketplace cap hit, etc. Caller supplies the
 * title + body sentences; this template just dresses them.
 *
 * Visual: navy transactional header (billing is administrative, not
 * celebratory). GloriaFood's "Your invoice is ready!" Oracle email is the
 * reference.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type BillingNotificationProps = {
  recipientName?: string;
  /** Header title — e.g. "Your invoice is ready" or "Payment received". */
  title: string;
  /** Header subtitle — e.g. the amount or the period. */
  subtitle?: string;
  /** Main message text. */
  body: string;
  /** Optional details rendered as a labeled card (amount, due date, etc.). */
  details?: { label: string; value: string }[];
  /** CTA — "View invoice", "Update billing", "Open admin", etc. */
  buttonLabel?: string;
  buttonUrl?: string;
  imprint?: string;
};

export default function BillingNotification(props: BillingNotificationProps) {
  const { recipientName, title, subtitle, body, details, buttonLabel,
    buttonUrl, imprint } = props;
  return (
    <EmailLayout preview={subtitle || title}>
      <EmailHeader variant="transactional" title={title} subtitle={subtitle} />
      <EmailBody>
        <P>Hello{recipientName ? ` ${recipientName}` : ""},</P>
        <P>{body}</P>

        {details && details.length > 0 && (
          <InfoCard label="Details" accent="slate">
            {details.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
                <span style={{ color: "#6b7280" }}>{d.label}</span>
                <strong>{d.value}</strong>
              </div>
            ))}
          </InfoCard>
        )}

        {buttonUrl && buttonLabel && (
          <EmailButton href={buttonUrl}>{buttonLabel}</EmailButton>
        )}

        <P size="sm" muted>
          Questions about your bill? Reply to this email and we&apos;ll take care of it.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
