/**
 * New-location welcome email (Luigi 2026-06-10).
 *
 * Sent when a brand owner creates a child location directly (with a mandatory
 * email). The location gets its OWN account; this email invites that owner to
 * set their password and start managing it. Distinct from "Reset your password"
 * (they never had one) and from LocationInvite (which routes through /signup).
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type LocationWelcomeProps = {
  /** The new location's name. */
  locationName: string;
  /** The brand/HQ that created it. */
  brandName: string;
  /** Set-password link (token-based). */
  setupUrl: string;
  /** Human expiry, e.g. "30 days". */
  expiresIn?: string;
  imprint?: string;
};

export default function LocationWelcome({
  locationName, brandName, setupUrl, expiresIn = "30 days", imprint,
}: LocationWelcomeProps) {
  return (
    <EmailLayout preview={`Set up ${locationName} on Fee Free Ordering`}>
      <EmailHeader variant="status" title="Your new store is ready" subtitle={locationName} />
      <EmailBody>
        <P>Hi {locationName},</P>
        <P>
          <strong>{brandName}</strong> just created a Fee Free Ordering account for your location.
          Choose a password to start managing it.
        </P>

        <InfoCard label="This account includes" accent="emerald">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            <li>Your own login + admin panel</li>
            <li>Your own billing + add-on subscriptions</li>
            <li>Your own listing on the Fee Free Marketplace</li>
          </ul>
        </InfoCard>

        <EmailButton href={setupUrl}>Set your password</EmailButton>

        <P size="sm" muted>
          This link is valid for <strong>{expiresIn}</strong>.
        </P>
        <P size="sm" muted>
          If the button doesn&apos;t work, paste this URL into your browser:<br />
          <a href={setupUrl} style={{ color: "#059669", wordBreak: "break-all" }}>{setupUrl}</a>
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
