/**
 * CUSTOMER-facing "you've been gifted reward dollars — create your account to
 * claim them" email (Luigi 2026-07-28) — fired when the restaurant gifts store
 * credit to an email that has NO account yet (Admin → Reward Dollars → Gift).
 * The PendingRewardGrant waits server-side; signing up with this email credits
 * the wallet automatically. Sibling of RewardGift.tsx (which covers the
 * already-has-account case, where the credit lands instantly).
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter, COLORS } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type RewardGiftInviteProps = {
  t: Translator;
  customerName: string;
  restaurantName: string;
  /** Pre-formatted gift amount in the restaurant's currency, e.g. "$10.00". */
  amountLabel: string;
  /** Restaurant's reward name ("Pizza Bucks"). */
  rewardLabel: string;
  /** Optional note the owner attached to the gift. */
  note?: string | null;
  /** Storefront root — signing up happens there. */
  orderUrl: string;
  /** The email the gift is locked to (they must sign up with THIS address). */
  giftEmail: string;
  imprint?: string;
};

export default function RewardGiftInvite(props: RewardGiftInviteProps) {
  const { t, customerName, restaurantName, amountLabel, rewardLabel, note, orderUrl, giftEmail, imprint } = props;
  return (
    <EmailLayout preview={t("email.rewardGiftInvite.preview", { restaurantName, amount: amountLabel, label: rewardLabel })}>
      <EmailHeader
        variant="transactional"
        title={t("email.rewardGiftInvite.title", { label: rewardLabel })}
        subtitle={restaurantName}
      />
      <EmailBody>
        <P>{t("email.rewardGiftInvite.greeting", { customerName })}</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{t("email.rewardGiftInvite.badge")}</Badge>
        </div>
        <P>{t("email.rewardGiftInvite.body", { restaurantName, amount: amountLabel, label: rewardLabel })}</P>
        <InfoCard label={rewardLabel} accent="emerald">
          <strong style={{ fontSize: 22 }}>+{amountLabel}</strong>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
            {t("email.rewardGiftInvite.claimLine", { email: giftEmail })}
          </div>
          {note && (
            <div style={{ fontSize: 13, color: COLORS.text, marginTop: 8, fontStyle: "italic" }}>
              “{note}”
            </div>
          )}
        </InfoCard>
        <P>{t("email.rewardGiftInvite.howTo", { restaurantName, label: rewardLabel })}</P>
        <EmailButton href={orderUrl}>{t("email.rewardGiftInvite.cta")}</EmailButton>
        <P muted size="sm">{t("email.rewardGiftInvite.ignoreLine")}</P>
      </EmailBody>
      <EmailFooter restaurantName={restaurantName} restaurantUrl={orderUrl} imprint={imprint}
        signOff={t("email.footer.signOff")}
        poweredByLabel={t("email.footer.poweredBy")} />
    </EmailLayout>
  );
}
