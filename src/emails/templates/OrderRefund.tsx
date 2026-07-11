/**
 * Customer-facing "you've been refunded" email. Sent whenever the restaurant
 * issues a refund on a card order — partial or full — so the customer always
 * gets a written record of the adjustment. (Luigi 2026-06-04.)
 */
import type { Translator } from "@/lib/i18n-dict";
import { escapeHtml } from "@/lib/html-safe";
import { EmailLayout, EmailHeader, EmailFooter, COLORS } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type OrderRefundProps = {
  t: Translator;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  /** Pre-formatted refund amount in the restaurant's currency, e.g. "$30.00". */
  refundAmountLabel: string;
  /** True when the whole order has now been refunded. */
  isFull: boolean;
  /** Pre-formatted store credit returned to the wallet alongside the card
   *  refund (full refunds of credit-part-paid orders). Optional — when unset
   *  the email reads exactly as before. */
  creditReturnedLabel?: string;
  /** Restaurant's reward label ("Pizza Bucks") — required with creditReturnedLabel. */
  rewardLabel?: string | null;
  imprint?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
};

export default function OrderRefund(props: OrderRefundProps) {
  const { t, customerName, orderNumber, restaurantName, refundAmountLabel, isFull,
    creditReturnedLabel, rewardLabel,
    imprint, restaurantUrl, restaurantEmail, restaurantPhone } = props;
  return (
    <EmailLayout preview={t("email.orderRefund.preview", { orderNumber })}>
      <EmailHeader
        variant="transactional"
        title={t("email.orderRefund.title")}
        subtitle={t("email.orderRefund.subtitle", { orderNumber })}
      />
      <EmailBody>
        <P>{t("email.orderRefund.greeting", { customerName })}</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">
            {isFull ? t("email.orderRefund.badgeFull") : t("email.orderRefund.badgePartial")}
          </Badge>
        </div>
        <p
          style={{ fontSize: 15, lineHeight: 1.55, color: COLORS.text, margin: "0 0 14px" }}
          dangerouslySetInnerHTML={{ __html: t("email.orderRefund.body", { restaurantName: `<strong>${escapeHtml(restaurantName)}</strong>` }) }}
        />
        <InfoCard label={t("email.orderRefund.amountLabel")} accent="emerald">
          <strong style={{ fontSize: 18 }}>{refundAmountLabel}</strong>
          <div style={{ fontSize: 13, color: COLORS.muted, marginTop: 4 }}>
            {t("email.orderRefund.timing")}
          </div>
          {/* Store credit spent on this order goes back to the WALLET, not the
              card — without this line a $30 order paid $10 bucks + $20 card
              read "Full refund — $20.00" with the bucks unexplained. */}
          {creditReturnedLabel && (
            <div style={{ fontSize: 13, color: COLORS.text, marginTop: 8 }}>
              {t("email.orderRefund.creditReturned", { label: rewardLabel || "", amount: creditReturnedLabel })}
            </div>
          )}
        </InfoCard>
        <P>{t("email.orderRefund.contactLine")}</P>
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
