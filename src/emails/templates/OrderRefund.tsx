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
  imprint?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
};

export default function OrderRefund(props: OrderRefundProps) {
  const { t, customerName, orderNumber, restaurantName, refundAmountLabel, isFull,
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
