/**
 * Trial-expiring email.
 *
 * Sent N days before a paid add-on trial expires so the owner has a chance
 * to update their card or cancel before being charged.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type TrialExpiringProps = {
  recipientName?: string;
  addonName: string;
  /** Days remaining as a number — e.g. 3. */
  daysRemaining: number;
  /** Monthly price after trial, formatted with currency, e.g. "$29.99". */
  priceAfterTrial: string;
  manageUrl: string;
  imprint?: string;
};

export default function TrialExpiring({
  recipientName, addonName, daysRemaining, priceAfterTrial, manageUrl, imprint,
}: TrialExpiringProps) {
  return (
    <EmailLayout preview={`${addonName} trial ends in ${daysRemaining} days`}>
      <EmailHeader
        variant="transactional"
        title={`Your ${addonName} trial ends soon`}
        subtitle={`${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} remaining`}
      />
      <EmailBody>
        <P>Hello{recipientName ? ` ${recipientName}` : ""},</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="amber">Trial ending</Badge>
        </div>
        <P>
          Your free trial of <strong>{addonName}</strong> ends in <strong>{daysRemaining} {daysRemaining === 1 ? "day" : "days"}</strong>. After that, your card will be charged <strong>{priceAfterTrial} / month</strong> on the same day each month.
        </P>

        <InfoCard label="What happens next" accent="slate">
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>
            <li><strong>Keep using {addonName}</strong> — do nothing, your subscription continues</li>
            <li><strong>Update billing</strong> — make sure your card on file is current</li>
            <li><strong>Cancel anytime</strong> — switch off the add-on from the billing page; no further charges</li>
          </ul>
        </InfoCard>

        <EmailButton href={manageUrl}>Manage subscription</EmailButton>

        <P size="sm" muted>
          You can also cancel by replying to this email. We won&apos;t make you jump through hoops.
        </P>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
