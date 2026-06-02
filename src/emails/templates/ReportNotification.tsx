/**
 * Reseller-report lifecycle notification.
 *
 * Generic transactional email for the Reseller Reports & Requests tracker:
 * "your report's fix has shipped — please verify", "your report was marked
 * Fixed", etc. Caller supplies the title + body + CTA; this template just
 * dresses them. Mirrors BillingNotification, but with report-appropriate
 * footer copy (no "questions about your bill?").
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton } from "../components/EmailParts";

export type ReportNotificationProps = {
  recipientName?: string;
  /** Header title — e.g. "A fix shipped for your report". */
  title: string;
  /** Header subtitle — e.g. the report title. */
  subtitle?: string;
  /** Main message text. */
  body: string;
  /** CTA — "Verify the fix", "View the report". */
  buttonLabel?: string;
  buttonUrl?: string;
  imprint?: string;
};

export default function ReportNotification(props: ReportNotificationProps) {
  const { recipientName, title, subtitle, body, buttonLabel, buttonUrl, imprint } = props;
  return (
    <EmailLayout preview={subtitle || title}>
      <EmailHeader variant="transactional" title={title} subtitle={subtitle} />
      <EmailBody>
        <P>Hello{recipientName ? ` ${recipientName}` : ""},</P>
        <P>{body}</P>

        {buttonUrl && buttonLabel && (
          <EmailButton href={buttonUrl}>{buttonLabel}</EmailButton>
        )}

        <P size="sm" muted>
          You&apos;re receiving this because you&apos;re involved in this report on Fee Free Ordering.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
