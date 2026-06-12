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
};

export default function CouponAssigned(props: CouponAssignedProps) {
  const {
    t, customerName, restaurantName, code, discountLabel, termLines,
    description, orderUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
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
        <P>{t("email.couponAssigned.intro", { restaurantName, discountLabel })}</P>
        <InfoCard label={t("email.couponAssigned.codeLabel")} accent="emerald">
          <span style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, letterSpacing: 2 }}>
            {code}
          </span>
        </InfoCard>
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
        <P>{t("email.couponAssigned.redeemHint")}</P>
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
