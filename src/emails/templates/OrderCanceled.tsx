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
  imprint?: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
};

export default function OrderCanceled(props: OrderCanceledProps) {
  const { t, customerName, orderNumber, restaurantName, reason, paidOnline,
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
      />
    </EmailLayout>
  );
}
