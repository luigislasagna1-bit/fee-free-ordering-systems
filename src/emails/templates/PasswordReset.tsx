/**
 * Password-reset email.
 *
 * Navy transactional header. Clear "you asked to reset your password"
 * preamble, big "Reset password" CTA button, link expiry note, fallback
 * "if you didn't request this" copy.
 *
 * Sent on: /api/auth/password-reset-request
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton } from "../components/EmailParts";

export type PasswordResetProps = {
  name?: string;
  resetUrl: string;
  /** Human duration, e.g. "1 hour" or "30 minutes". */
  expiresIn?: string;
  imprint?: string;
};

export default function PasswordReset({
  name, resetUrl, expiresIn = "1 hour", imprint,
}: PasswordResetProps) {
  return (
    <EmailLayout preview="Reset your Fee Free Ordering password">
      <EmailHeader
        variant="transactional"
        title="Reset your password"
        subtitle="Use the button below to set a new one"
      />
      <EmailBody>
        <P>Hello{name ? ` ${name}` : ""},</P>
        <P>
          We received a request to reset the password on your Fee Free Ordering account. Click the button below to choose a new one — the link is valid for <strong>{expiresIn}</strong>.
        </P>
        <EmailButton href={resetUrl}>Reset password</EmailButton>
        <P size="sm" muted>
          If the button doesn&apos;t work, copy and paste this URL into your browser:<br />
          <a href={resetUrl} style={{ color: "#059669", wordBreak: "break-all" }}>{resetUrl}</a>
        </P>
        <P size="sm" muted>
          <strong>Didn&apos;t request this?</strong> You can safely ignore this email — your password won&apos;t change unless you click the link above. If you&apos;re worried someone else may be trying to access your account, reply to this email and we&apos;ll look into it.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
