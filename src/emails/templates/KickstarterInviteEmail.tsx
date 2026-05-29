/**
 * Kickstarter "Invite Prospects" invite email.
 *
 * Sent by the /api/cron/kickstarter-invites cron to each Prospect
 * uploaded via the /admin/kickstarter CSV importer. Pairs with the
 * First Buy Promo (10% off first order, auto-applied for new
 * customers) to give the recipient an immediate reason to click
 * through and place their first order.
 *
 * Visual: emerald "good news" header, big coupon code card, CTA
 * to the restaurant's ordering page with ?ref=kickstarter for
 * downstream conversion attribution.
 *
 * Not currently rendered by sendInviteEmail() (which detours through
 * the AutopilotEmail wrapper for its List-Unsubscribe plumbing) —
 * kept here so the design is committed and a future email.ts refactor
 * can swap it in without changing the schema or cron.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type KickstarterInviteEmailProps = {
  /** Optional — when the CSV row didn't include a name, we greet the
   *  recipient generically ("Hi there"). */
  prospectName?: string;
  restaurantName: string;
  couponCode: string;
  ctaUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function KickstarterInviteEmail(props: KickstarterInviteEmailProps) {
  const {
    prospectName, restaurantName, couponCode, ctaUrl,
    restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;

  return (
    <EmailLayout preview={`Try ${restaurantName} — 10% off your first order`}>
      <EmailHeader
        variant="status"
        title={`Welcome to ${restaurantName}`}
        subtitle="A little something to get you started"
      />
      <EmailBody>
        <P>Hi {prospectName ?? "there"},</P>
        <P>
          We&apos;d love to have you try {restaurantName}. As a welcome gift,
          here&apos;s 10% off your first order.
        </P>

        <InfoCard label="Your coupon" accent="emerald">
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "monospace", letterSpacing: "0.1em", color: "#065f46", marginBottom: 4 }}>
            {couponCode}
          </div>
          <div style={{ fontSize: 13, color: "#065f46" }}>
            10% off your first order
          </div>
          <div style={{ fontSize: 12, color: "#047857", marginTop: 6 }}>
            Use code <strong>{couponCode}</strong> at checkout — or just click below and it&apos;ll auto-apply.
          </div>
        </InfoCard>

        <EmailButton href={ctaUrl}>Start your order</EmailButton>

        <P size="sm" muted>
          See you soon!
        </P>
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
