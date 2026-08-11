/**
 * CUSTOMER-facing "you've been gifted reward dollars — create your account to
 * claim them" email (Luigi 2026-07-28) — fired when the restaurant gifts store
 * credit to an email that has NO account yet (Admin → Reward Dollars → Gift).
 * The PendingRewardGrant waits server-side; signing up with this email credits
 * the wallet automatically. Sibling of RewardGift.tsx (which covers the
 * already-has-account case, where the credit lands instantly).
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter, COLORS, padSide, marginSide, textStart, textEnd, type MarketingFooterStrings } from "../components/EmailLayout";
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
  /** Storefront signup form — the SECONDARY path now (Gift Wallet Pass, when
   *  present, is the primary CTA). */
  orderUrl: string;
  /** The email the gift is locked to (they must sign up with THIS address). */
  giftEmail: string;
  imprint?: string;
  /** Gift Wallet Pass — spend without an account (2026-08-03). When present,
   *  becomes the PRIMARY CTA. `spendUrl` carries the code in the URL
   *  FRAGMENT (never sent to the server/logs); `code` is the same secret
   *  printed as human-typable text (grouped "XXXX-XXXX-XXXX-XXXX") for the
   *  claim-page fallback and mail clients that strip fragments. */
  spendUrl?: string | null;
  code?: string | null;
  /** Pre-formatted expiry date of the CODE (not the gift — the gift itself
   *  never expires), in the restaurant's timezone. */
  codeExpiryLabel?: string | null;
  /** CASL opt-out (built by the sender via buildOptOutFooter). */
  unsubscribeUrl?: string;
  dataDeletionUrl?: string;
  marketingStrings?: MarketingFooterStrings;
};

/** One numbered step. Table-free, block-level, explicit sizes — Outlook desktop
 *  ignores flex/grid, so the number sits in an inline-block badge rather than a
 *  column layout. */
function Step({ n, title, body, locale }: { n: number; title: string; body: string; locale?: string | null }) {
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
            ...marginSide(textEnd(locale), 8),
          }}
        >
          {n}
        </span>
        {title}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, color: COLORS.muted, ...padSide(textStart(locale), 30) }}>{body}</div>
    </div>
  );
}

export default function RewardGiftInvite(props: RewardGiftInviteProps) {
  const { t, customerName, restaurantName, amountLabel, rewardLabel, note, orderUrl, giftEmail, imprint, spendUrl, code, codeExpiryLabel, unsubscribeUrl, dataDeletionUrl, marketingStrings } = props;
  const hasPass = !!spendUrl && !!code;
  return (
    <EmailLayout locale={t.locale} preview={t("email.rewardGiftInvite.preview", { restaurantName, amount: amountLabel, label: rewardLabel })}>
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
        {/* Teach it, don't just announce it. The recipient may never have heard
            of this restaurant's rewards, so say what the credit IS in plain
            words before asking them to do anything, then give the three steps
            in order. Luigi 2026-07-31: "make sure even new guests understand
            how to use their gift". */}
        {hasPass ? (
          <>
            <P>{t("email.rewardGiftInvite.whatItIsSpend", { restaurantName, label: rewardLabel })}</P>
            <Step locale={t.locale} n={1} title={t("email.rewardGiftInvite.step1TitleSpend")} body={t("email.rewardGiftInvite.step1BodySpend")} />
            <Step locale={t.locale} n={2} title={t("email.rewardGiftInvite.step2TitleSpend")} body={t("email.rewardGiftInvite.step2BodySpend", { amount: amountLabel })} />
            <Step locale={t.locale} n={3} title={t("email.rewardGiftInvite.step3TitleSpend")} body={t("email.rewardGiftInvite.step3BodySpend")} />
          </>
        ) : (
          <>
            {/* Teach it, don't just announce it. The recipient may never have
                heard of this restaurant's rewards, so say what the credit IS
                in plain words before asking them to do anything, then give
                the three steps in order. Luigi 2026-07-31: "make sure even
                new guests understand how to use their gift". */}
            <P>{t("email.rewardGiftInvite.whatItIs", { restaurantName, label: rewardLabel })}</P>
            <Step
              locale={t.locale}
              n={1}
              title={t("email.rewardGiftInvite.step1Title")}
              body={t("email.rewardGiftInvite.step1Body", { email: giftEmail })}
            />
            <Step
              locale={t.locale}
              n={2}
              title={t("email.rewardGiftInvite.step2Title", { amount: amountLabel })}
              body={t("email.rewardGiftInvite.step2Body")}
            />
            <Step
              locale={t.locale}
              n={3}
              title={t("email.rewardGiftInvite.step3Title")}
              body={t("email.rewardGiftInvite.step3Body", { label: rewardLabel })}
            />
          </>
        )}
        {hasPass ? (
          <>
            <EmailButton href={spendUrl!}>
              {t("email.rewardGiftInvite.spendCtaPrimary", { amount: amountLabel })}
            </EmailButton>
            <div
              style={{
                margin: "0 0 16px",
                padding: "14px 16px",
                borderRadius: 8,
                backgroundColor: "#f8fafc",
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 6 }}>
                {t("email.rewardGiftInvite.orTypeThisCode")}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                  letterSpacing: 1.5,
                  fontWeight: 700,
                  color: COLORS.text,
                }}
              >
                {code}
              </div>
            </div>
            <P muted size="sm">{t("email.rewardGiftInvite.doNotForwardLine")}</P>
            <P muted size="sm">{t("email.rewardGiftInvite.neverExpiresLine", { label: rewardLabel })}</P>
            {codeExpiryLabel && (
              <P muted size="sm">{t("email.rewardGiftInvite.codeExpiryLine", { date: codeExpiryLabel })}</P>
            )}
            <EmailButton href={orderUrl} variant="secondary">
              {t("email.rewardGiftInvite.createAccountSecondary")}
            </EmailButton>
          </>
        ) : (
          <EmailButton href={orderUrl}>{t("email.rewardGiftInvite.cta")}</EmailButton>
        )}
        <P muted size="sm">{t("email.rewardGiftInvite.ignoreLine")}</P>
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
