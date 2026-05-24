/**
 * Email-settings test — sent from /superadmin/settings/email when an
 * admin clicks "Send test email" to verify Resend credentials work.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, Badge } from "../components/EmailParts";

export type EmailSettingsTestProps = { imprint?: string };

export default function EmailSettingsTest({ imprint }: EmailSettingsTestProps) {
  return (
    <EmailLayout preview="Fee Free email transport test — success">
      <EmailHeader variant="status" title="Email transport works ✓" subtitle="Test message" />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">Success</Badge>
        </div>
        <P>This is a test from your Fee Free Ordering super-admin panel.</P>
        <P>If you can read this, your Resend API key + sender address are configured correctly and the platform can deliver email to this inbox.</P>
        <P size="sm" muted>
          No action needed. You can close this email.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
