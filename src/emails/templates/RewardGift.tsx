/**
 * CUSTOMER-facing "you've been gifted reward dollars" email (Luigi
 * 2026-07-11) — fired when the restaurant manually grants store credit from
 * Admin → Customers. Fully localized via the injected Translator; caller
 * gates on rewardsEnabled + marketingConsent (standing rule: every new
 * marketing email path respects consent).
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter, COLORS, type MarketingFooterStrings } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

/** One numbered step — mirrors RewardGiftInvite's so the two gift emails read
 *  as one family. Inline-block badge rather than columns: Outlook desktop
 *  ignores flex/grid. */
function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ margin: "0 0 14px" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, margin: "0 0 2px" }}>
        <span
          style={{
            display: "inline-block",
            width: 22,
            height: 22,
            lineHeight: "22px",
            textAlign: "center",
            borderRadius: 11,
            backgroundColor: "#059669",
            color: "#ffffff",
            fontSize: 12,
            fontWeight: 700,
            marginRight: 8,
          }}
        >
          {n}
        </span>
        {title}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: COLORS.muted, paddingLeft: 30 }}>{body}</div>
    </div>
  );
}

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
  /** The address the credit is attached to — step 1 tells them to sign in with
   *  THIS one, since a different address is a different wallet. */
  giftEmail?: string;
  orderUrl: string;
  imprint?: string;
  /** CASL opt-out (built by the sender via buildOptOutFooter). */
  unsubscribeUrl?: string;
  dataDeletionUrl?: string;
  marketingStrings?: MarketingFooterStrings;
};

export default function RewardGift(props: RewardGiftProps) {
  const { t, customerName, restaurantName, amountLabel, rewardLabel, balanceLabel, note, giftEmail, orderUrl, imprint, unsubscribeUrl, dataDeletionUrl, marketingStrings } = props;
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
        {/* Say what the credit IS, then the three steps to spend it. The old
            copy was a single line ("your {label} are applied at checkout"),
            which assumes the reader already knows what that means — a first-time
            recipient does not. Luigi 2026-07-31. */}
        <P>{t("email.rewardGift.whatItIs", { restaurantName, label: rewardLabel })}</P>
        <Step
          n={1}
          title={t("email.rewardGift.step1Title")}
          body={
            giftEmail
              ? t("email.rewardGift.step1Body", { email: giftEmail, label: rewardLabel })
              : t("email.rewardGift.step1BodyNoEmail")
          }
        />
        <Step
          n={2}
          title={t("email.rewardGift.step2Title")}
          body={t("email.rewardGift.step2Body", { restaurantName })}
        />
        <Step
          n={3}
          title={t("email.rewardGift.step3Title", { label: rewardLabel })}
          body={t("email.rewardGift.step3Body", { label: rewardLabel })}
        />
        <EmailButton href={orderUrl}>{t("email.rewardGift.cta")}</EmailButton>
      </EmailBody>
      <EmailFooter restaurantName={restaurantName} restaurantUrl={orderUrl} imprint={imprint}
        signOff={t("email.footer.signOff")}
        poweredByLabel={t("email.footer.poweredBy")}
        unsubscribeUrl={unsubscribeUrl}
        dataDeletionUrl={dataDeletionUrl}
        marketing={!!marketingStrings}
        marketingStrings={marketingStrings} />
    </EmailLayout>
  );
}
