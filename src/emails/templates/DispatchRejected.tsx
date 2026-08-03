/**
 * STAFF-facing "ShipDay rejected this order's dispatch" alert (Luigi
 * 2026-08-03). Auto-dispatch on order-accept can fail — ShipDay can
 * reject an order with HTTP 200 + success:false (bad address, missing
 * field, etc, see src/lib/shipday-payload.ts) — and until now that
 * failure was invisible to staff; they'd only notice when the order
 * still showed "not dispatched" on the admin order page. Gated on the
 * NotificationRecipient `dispatchRejected` toggle (default ON — this is
 * an operational failure alert, not a new-feature ping).
 *
 * FULLY LOCALIZED ×38 per the staff-email convention: body follows the
 * recipient's emailLanguage. Keys under email.dispatchRejected.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type DispatchRejectedProps = {
  t: Translator;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  reason?: string | null;
  dashboardUrl: string;
  imprint?: string;
};

export default function DispatchRejected(props: DispatchRejectedProps) {
  const { t, restaurantName, orderNumber, customerName, reason, dashboardUrl, imprint } = props;
  return (
    <EmailLayout preview={t("email.dispatchRejected.preview", { orderNumber })}>
      <EmailHeader
        variant="transactional"
        title={t("email.dispatchRejected.headerTitle")}
        subtitle={t("email.dispatchRejected.subtitle", { orderNumber })}
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="rose">{t("email.dispatchRejected.badge")}</Badge>
        </div>
        <P>{t("email.dispatchRejected.body", { orderNumber, customerName })}</P>
        {reason && (
          <InfoCard label={t("email.dispatchRejected.reasonLabel")} accent="amber">
            {reason}
          </InfoCard>
        )}
        <P>{t("email.dispatchRejected.actionLine")}</P>
        <EmailButton href={dashboardUrl}>{t("email.dispatchRejected.viewOrderButton")}</EmailButton>
      </EmailBody>
      <EmailFooter restaurantName={restaurantName} imprint={imprint} signOff={t("email.footer.signOff")} poweredByLabel={t("email.footer.poweredBy")} />
    </EmailLayout>
  );
}
