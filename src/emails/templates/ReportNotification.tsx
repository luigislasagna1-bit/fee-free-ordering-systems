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
  /** Main message text. Plain text — React escapes it. A blank line starts a
   *  new paragraph and a single newline a line break, so multi-paragraph
   *  bodies (reseller-report notes, queued ops messages) don't collapse into
   *  one run-on <p>. Bodies without newlines render exactly as before. */
  body: string;
  /** CTA — "Verify the fix", "View the report". */
  buttonLabel?: string;
  buttonUrl?: string;
  imprint?: string;
};

/** Split plain text into paragraphs (blank-line separated) of lines. A body
 *  with no newlines yields [[body]] — one <P> with the raw string, exactly the
 *  pre-2026-08-15 markup. Empty result is never returned (falls back to [[""]]). */
function bodyParagraphs(body: string): string[][] {
  const paras = String(body ?? "")
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n+/)
    .map((p) => p.split("\n"))
    .filter((lines) => lines.some((l) => l.trim().length > 0));
  return paras.length > 0 ? paras : [[String(body ?? "")]];
}

export default function ReportNotification(props: ReportNotificationProps) {
  const { recipientName, title, subtitle, body, buttonLabel, buttonUrl, imprint } = props;
  return (
    <EmailLayout preview={subtitle || title}>
      <EmailHeader variant="transactional" title={title} subtitle={subtitle} />
      <EmailBody>
        <P>Hello{recipientName ? ` ${recipientName}` : ""},</P>
        {bodyParagraphs(body).map((lines, pi) => (
          <P key={pi}>
            {lines.length === 1
              ? lines[0]
              : lines.map((line, li) => (
                  <span key={li}>
                    {li > 0 && <br />}
                    {line}
                  </span>
                ))}
          </P>
        ))}

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
