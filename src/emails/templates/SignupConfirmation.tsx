/**
 * Restaurant-owner signup welcome email.
 *
 * Sent right after the owner creates their account at /signup. Two
 * jobs in one email:
 *   1. Welcome them + tell them what's next (set up menu, hours, services,
 *      then publish)
 *   2. Get them to verify their email so we can unlock notifications +
 *      publishing
 *
 * Visual: emerald status header (it's a "good news" moment, not a billing
 * thing). Two CTAs — primary "Verify email", secondary "Open dashboard."
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type SignupConfirmationProps = {
  name: string;
  restaurantName: string;
  loginUrl: string;
  verifyUrl: string;
  imprint?: string;
};

export default function SignupConfirmation({
  name, restaurantName, loginUrl, verifyUrl, imprint,
}: SignupConfirmationProps) {
  return (
    <EmailLayout preview={`Welcome to Fee Free Ordering, ${restaurantName}`}>
      <EmailHeader
        variant="status"
        title="Welcome to Fee Free Ordering!"
        subtitle={`${restaurantName} is now on the platform`}
      />
      <EmailBody>
        <P>Hi {name},</P>
        <P>
          Welcome to Fee Free Ordering! You&apos;re a few minutes away from taking online orders without giving away 30% to UberEats or DoorDash.
        </P>

        <InfoCard label="Confirm your email" accent="emerald">
          Click the button below to verify the email address you signed up with. This unlocks notifications and lets you publish your restaurant.
        </InfoCard>
        <EmailButton href={verifyUrl}>Verify email</EmailButton>

        <P size="sm" muted>
          If the button doesn&apos;t work, paste this URL into your browser:<br />
          <a href={verifyUrl} style={{ color: "#059669", wordBreak: "break-all" }}>{verifyUrl}</a>
        </P>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginBottom: 6 }}>
            What&apos;s next
          </div>
          <ol style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: "#111827", margin: 0 }}>
            <li>Add your menu items (or import them from a screenshot — we can help)</li>
            <li>Set your opening hours + delivery zones</li>
            <li>Choose which services you offer (delivery, pickup, dine-in, reservations)</li>
            <li>Publish — your restaurant goes live and starts taking orders</li>
          </ol>
        </div>

        <EmailButton href={loginUrl} variant="secondary">Open admin dashboard</EmailButton>

        <P size="sm" muted>
          Need help? Reply to this email — we read every message.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
