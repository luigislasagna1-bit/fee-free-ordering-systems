/**
 * Customer-facing "you've received a personal coupon" email.
 *
 * Fired from POST /api/admin/customers/[id]/assign-coupon when the
 * restaurant assigns a personal coupon to this customer (reseller
 * report cmqa6lls1 — Fabrizio: the customer should automatically get
 * the code by email together with every condition attached to it).
 *
 * Shows: the discount headline, the code in a copy-friendly card, and
 * ONLY the terms that actually apply (minimum order, expiry, number of
 * uses, the owner's own description). Sent only when the customer has
 * marketingConsent — gated by the caller, not here.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type CouponAssignedProps = {
  t: Translator;
  customerName: string;
  restaurantName: string;
  /** The coupon code, e.g. "MR-4F2A1B". */
  code: string;
  /** Localized discount headline, e.g. "10% off" / "€5.00 off" — built by the sender. */
  discountLabel: string;
  /** Pre-formatted applicable terms, one per line — built by the sender. */
  termLines: string[];
  /** Owner-written description, shown verbatim when present. */
  description?: string | null;
  /** Customer ordering page URL. */
  orderUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
  /** VIP member-special mode: no code (it auto-applies), with usage instructions
   *  tailored to whether the recipient has an account. Luigi 2026-06-27. */
  memberSpecial?: boolean;
  /** Overrides the default intro line (member-special context). */
  introOverride?: string;
  /** "How to use it" line — account vs guest (member-special only). */
  usageNote?: string;
  /** Optional "make an account" nudge for guests (member-special only). */
  accountTip?: string;
};

export default function CouponAssigned(props: CouponAssignedProps) {
  const {
    t, customerName, restaurantName, code, discountLabel, termLines,
    description, orderUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
    memberSpecial, introOverride, usageNote, accountTip,
  } = props;

  return (
    <EmailLayout preview={t("email.couponAssigned.preview", { restaurantName, discountLabel })}>
      <EmailHeader
        variant="status"
        title={t("email.couponAssigned.title", { discountLabel })}
        subtitle={restaurantName}
      />
      <EmailBody>
        <P>{t("email.couponAssigned.greeting", { customerName })}</P>
        <P>{introOverride ?? t("email.couponAssigned.intro", { restaurantName, discountLabel })}</P>
        {/* Member specials auto-apply (by sign-in or email) — no code to show. */}
        {!memberSpecial && (
          <InfoCard label={t("email.couponAssigned.codeLabel")} accent="emerald">
            <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
              {code}
            </span>
          </InfoCard>
        )}
        {description && (
          <InfoCard label={t("email.couponAssigned.noteLabel")} accent="neutral">
            {description}
          </InfoCard>
        )}
        {termLines.length > 0 && (
          <InfoCard label={t("email.couponAssigned.termsLabel")} accent="amber">
            {termLines.map((line, i) => (
              <span key={i} style={{ display: "block" }}>{line}</span>
            ))}
          </InfoCard>
        )}
        {memberSpecial && usageNote ? (
          <InfoCard label={t("email.vipSpecial.howToLabel")} accent="emerald">{usageNote}</InfoCard>
        ) : (
          <P>{t("email.couponAssigned.redeemHint")}</P>
        )}
        {memberSpecial && accountTip && <P>{accountTip}</P>}
        <EmailButton href={orderUrl}>{t("email.couponAssigned.cta")}</EmailButton>
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
