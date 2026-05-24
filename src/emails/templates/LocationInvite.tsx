/**
 * Multi-location invite email.
 *
 * Sent by a brand owner who wants to add a new location to their group.
 * The recipient clicks the link to sign up — their new restaurant is
 * auto-linked to the brand via parentRestaurantId.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type LocationInviteProps = {
  /** Brand owner's restaurant name — they're the one inviting. */
  parentRestaurantName: string;
  /** Brand owner's name (the sender). */
  inviterName?: string;
  inviteUrl: string;
  /** Expiry as human duration, e.g. "30 days". */
  expiresIn?: string;
  imprint?: string;
};

export default function LocationInvite({
  parentRestaurantName, inviterName, inviteUrl, expiresIn = "30 days", imprint,
}: LocationInviteProps) {
  return (
    <EmailLayout preview={`You're invited to join ${parentRestaurantName} on Fee Free Ordering`}>
      <EmailHeader
        variant="status"
        title="You're invited to join a brand"
        subtitle={parentRestaurantName}
      />
      <EmailBody>
        <P>Hello,</P>
        <P>
          {inviterName ? <>{inviterName} from <strong>{parentRestaurantName}</strong></> : <strong>{parentRestaurantName}</strong>} has invited you to set up a new location under their brand on Fee Free Ordering.
        </P>

        <InfoCard label="What you get" accent="emerald">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            <li>Your own login + admin panel</li>
            <li>Your own Stripe account + add-on subscriptions</li>
            <li>Listed under the same brand on the Fee Free Marketplace</li>
            <li>Shared menu (optional) — you can revert any change locally</li>
          </ul>
        </InfoCard>

        <EmailButton href={inviteUrl}>Accept invite + create my location</EmailButton>

        <P size="sm" muted>
          This invite link is valid for <strong>{expiresIn}</strong> and can only be used once.
        </P>
        <P size="sm" muted>
          If the button doesn&apos;t work, paste this URL into your browser:<br />
          <a href={inviteUrl} style={{ color: "#059669", wordBreak: "break-all" }}>{inviteUrl}</a>
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
