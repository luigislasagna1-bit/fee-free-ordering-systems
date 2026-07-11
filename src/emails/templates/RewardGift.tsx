/**
 * CUSTOMER-facing "you've been gifted reward dollars" email (Luigi
 * 2026-07-11) — fired when the restaurant manually grants store credit from
 * Admin → Customers. Fully localized via the injected Translator; caller
 * gates on rewardsEnabled + marketingConsent (standing rule: every new
 * marketing email path respects consent).
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter, COLORS } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type RewardGiftProps = {
  t: Translator;
  customerName: string;
  restaurantName: string;
  /** Pre-formatted gift amount in the restaurant's currency, e.g. "$5.00". */
  amountLabel: string;
  /** Restaurant's reward name ("Pizza Bucks"). */
  rewardLabel: string;
  /** Pre-formatted wallet balance AFTER the gift. */
  balanceLabel: string;
  /** Optional note the owner attached to the grant. */
  note?: string | null;
  orderUrl: string;
  imprint?: string;
};

export default function RewardGift(props: RewardGiftProps) {
  const { t, customerName, restaurantName, amountLabel, rewardLabel, balanceLabel, note, orderUrl, imprint } = props;
  return (
    <EmailLayout preview={t("email.rewardGift.preview", { restaurantName, amount: amountLabel, label: rewardLabel })}>
      <EmailHeader
        variant="transactional"
        title={t("email.rewardGift.title", { label: rewardLabel })}
        subtitle={restaurantName}
      />
      <EmailBody>
        <P>{t("email.rewardGift.greeting", { customerName })}</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{t("email.rewardGift.badge")}</Badge>
        </div>
        <P>{t("email.rewardGift.body", { restaurantName, amount: amountLabel, label: rewardLabel })}</P>
        <InfoCard label={rewardLabel} accent="emerald">
          <strong style={{ fontSize: 22 }}>+{amountLabel}</strong>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
            {t("email.rewardGift.balanceLine", { balance: balanceLabel })}
          </div>
          {note && (
            <div style={{ fontSize: 13, color: COLORS.text, marginTop: 8, fontStyle: "italic" }}>
              “{note}”
            </div>
          )}
        </InfoCard>
        <P>{t("email.rewardGift.spendHint", { label: rewardLabel })}</P>
        <EmailButton href={orderUrl}>{t("email.rewardGift.cta")}</EmailButton>
      </EmailBody>
      <EmailFooter restaurantName={restaurantName} restaurantUrl={orderUrl} imprint={imprint} />
    </EmailLayout>
  );
}
