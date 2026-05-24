/**
 * Standalone "verify your email" email.
 *
 * Sent when the user re-requests a verification link (e.g. from the
 * "verify email" banner inside /admin if the first verification email
 * was missed or expired).
 *
 * Visual: navy transactional header — verification is a security action,
 * not a "welcome" moment, so we match billing/password-reset styling.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton } from "../components/EmailParts";

export type VerifyEmailProps = {
  name?: string;
  verifyUrl: string;
  imprint?: string;
};

export default function VerifyEmail({ name, verifyUrl, imprint }: VerifyEmailProps) {
  return (
    <EmailLayout preview="Verify your Fee Free Ordering email address">
      <EmailHeader
        variant="transactional"
        title="Verify your email"
        subtitle="One click to confirm your address"
      />
      <EmailBody>
        <P>Hello{name ? ` ${name}` : ""},</P>
        <P>
          Please confirm the email address on your Fee Free Ordering account. Clicking the button below unlocks notifications and lets you publish your restaurant.
        </P>
        <EmailButton href={verifyUrl}>Verify email</EmailButton>
        <P size="sm" muted>
          If the button doesn&apos;t work, paste this URL into your browser:<br />
          <a href={verifyUrl} style={{ color: "#059669", wordBreak: "break-all" }}>{verifyUrl}</a>
        </P>
        <P size="sm" muted>
          <strong>Didn&apos;t sign up?</strong> Ignore this email — without clicking the link, nothing changes on your account.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
