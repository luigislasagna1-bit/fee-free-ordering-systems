/**
 * Customer-facing "your order was canceled" email.
 *
 * Sent when an order is canceled after acceptance — could be the restaurant
 * canceling (rare), the customer canceling, or the auto-cancel from a
 * Stripe dispute. Refund treatment same as rejection.
 */
import type { Translator } from "@/lib/i18n-dict";
import { escapeHtml } from "@/lib/html-safe";
import { EmailLayout, EmailHeader, EmailFooter, COLORS } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type OrderCanceledProps = {
  t: Translator;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  reason?: string | null;
  paidOnline: boolean;
  /** Order money — the staff copy of a rejected/canceled order used to carry
   *  NO amounts at all, so the owner was told an order died without being told
   *  what it was worth or that store credit went back to the customer's wallet.
   *  All PRE-FORMATTED; the block renders only when `orderTotalLabel` is set.
   *  Luigi 2026-08-07. */
  orderTotalLabel?: string;
  creditReturnedLabel?: string;
  collectedLabel?: string;
  rewardLabel?: string | null;
  imprint?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
};

export default function OrderCanceled(props: OrderCanceledProps) {
  const { t, customerName, orderNumber, restaurantName, reason, paidOnline,
    orderTotalLabel, creditReturnedLabel, collectedLabel, rewardLabel,
    imprint, restaurantUrl, restaurantEmail, restaurantPhone } = props;
  return (
    <EmailLayout preview={t("email.orderCanceled.preview", { orderNumber })}>
      <EmailHeader
        variant="transactional"
        title={t("email.orderCanceled.title")}
        subtitle={t("email.orderCanceled.subtitle", { orderNumber })}
      />
      <EmailBody>
        <P>{t("email.orderCanceled.greeting", { customerName })}</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="rose">{t("email.orderCanceled.badge")}</Badge>
        </div>
        <p
          style={{ fontSize: 15, lineHeight: 1.55, color: COLORS.text, margin: "0 0 14px" }}
          dangerouslySetInnerHTML={{ __html: t("email.orderCanceled.body", { restaurantName: `<strong>${escapeHtml(restaurantName)}</strong>` }) }}
        />
        {reason && (
          <InfoCard label={t("email.orderCanceled.reasonLabel")} accent="amber">
            {reason}
          </InfoCard>
        )}
        {orderTotalLabel && (
          <InfoCard label={t("money.orderValue")} accent="slate">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span>{t("ordering.total")}</span>
              <span>{orderTotalLabel}</span>
            </div>
            {creditReturnedLabel && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span>{t("receipt.customer.paidWithReward", { label: rewardLabel || "" })}</span>
                <span>− {creditReturnedLabel}</span>
              </div>
            )}
            {collectedLabel && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontWeight: 700, marginTop: 4 }}>
                <span>{t("money.amountCollected")}</span>
                <span>{collectedLabel}</span>
              </div>
            )}
            {creditReturnedLabel && (
              <div style={{ marginTop: 8, fontSize: 13 }}>
                {t("email.staffOrderDead.creditReturned", { label: rewardLabel || "", amount: creditReturnedLabel })}
              </div>
            )}
          </InfoCard>
        )}
        {paidOnline && (
          <InfoCard label={t("email.orderCanceled.refundLabel")} accent="emerald">
            <span dangerouslySetInnerHTML={{ __html: t("email.orderCanceled.refundBody") }} />
          </InfoCard>
        )}
        <P>{t("email.orderCanceled.contactLine")}</P>
      </EmailBody>
      <EmailFooter
        restaurantName={restaurantName}
        restaurantUrl={restaurantUrl}
        restaurantEmail={restaurantEmail}
        restaurantPhone={restaurantPhone}
        imprint={imprint}
        signOff={t("email.footer.signOff")}
        poweredByLabel={t("email.footer.poweredBy")}
      />
    </EmailLayout>
  );
}
