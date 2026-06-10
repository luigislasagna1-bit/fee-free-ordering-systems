/**
 * Customer-facing "your order was rejected" email.
 *
 * Sent when the restaurant rejects an order. If the order was paid online,
 * the auto-refund cron has already started — we mention it here so the
 * customer knows the money is coming back.
 *
 * Visual: amber/slate header (not emerald — this is not a happy email).
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type OrderRejectedProps = {
  t: Translator;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  reason?: string | null;
  /** True if the original payment was online — triggers the refund message. */
  paidOnline: boolean;
  /** True when the card was already captured (Stripe: paymentStatus="paid").
   *  Used to distinguish "your card was not charged" (auth-only, no capture)
   *  from "we'll refund you" (captured, money moved). Mirrors what
   *  GloriaFood writes in the same case (Fabrizio 2026-06-01 feedback). */
  paymentCaptured?: boolean;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function OrderRejected(props: OrderRejectedProps) {
  const { t, customerName, orderNumber, restaurantName, reason, paidOnline, paymentCaptured,
    restaurantUrl, restaurantEmail, restaurantPhone, imprint } = props;
  // A timed-out order is auto-rejected ("missed") — show the MISSED badge (amber,
  // reusing the kitchen's word) and hide the internal "Auto-rejected:" reason,
  // consistent with the kitchen + the customer email. Luigi 2026-06-09.
  const isMissed = (reason ?? "").trim().startsWith("Auto-rejected");
  return (
    <EmailLayout preview={t("email.orderRejected.preview", { orderNumber })}>
      <EmailHeader
        variant="transactional"
        title={t("email.orderRejected.title")}
        subtitle={t("email.orderRejected.subtitle", { orderNumber })}
      />
      <EmailBody>
        <P>{t("email.orderRejected.greeting", { customerName })}</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color={isMissed ? "amber" : "rose"}>{isMissed ? t("kitchen.missed") : t("email.orderRejected.badgeRejected")}</Badge>
        </div>
        <P>{t("email.orderRejected.sorryLine", { restaurantName })}</P>
        {reason && !isMissed && (
          <InfoCard label={t("email.orderRejected.reasonLabel")} accent="amber">
            {reason}
          </InfoCard>
        )}
        {paidOnline && (
          paymentCaptured ? (
            <InfoCard label={t("email.orderRejected.refundLabel")} accent="emerald">
              <span
                dangerouslySetInnerHTML={{
                  __html: t("email.orderRejected.refundBody", { days: "<strong>5–10 business days</strong>" }),
                }}
              />
            </InfoCard>
          ) : (
            <InfoCard label={t("email.orderRejected.paymentLabel")} accent="emerald">
              <span
                dangerouslySetInnerHTML={{
                  __html: t("email.orderRejected.notChargedBody"),
                }}
              />
            </InfoCard>
          )
        )}
        {restaurantPhone && (
          <P>
            {t("email.orderRejected.questionsLine")}{" "}
            <a href={`tel:${restaurantPhone.replace(/[^0-9+]/g, "")}`} style={{ color: "#047857", fontWeight: 600 }}>
              {restaurantPhone}
            </a>
          </P>
        )}
        <P>{t("email.orderRejected.closingLine")}</P>
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
