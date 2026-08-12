/**
 * STAFF-facing "a new customer signed up" ping (Luigi 2026-07-11) — fired by
 * the per-restaurant account signup route, gated on the NotificationRecipient
 * `customerSignup` toggle (default OFF).
 *
 * FULLY LOCALIZED ×38 (Fabrizio cms0gyexp #1 — policy flip, Luigi 2026-07-29):
 * staff bodies follow the recipient's emailLanguage. Keys under
 * email.customerSignup.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type CustomerSignupNotificationProps = {
  t: Translator;
  restaurantName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  dashboardUrl: string;
  imprint?: string;
};

export default function CustomerSignupNotification(props: CustomerSignupNotificationProps) {
  const { t, restaurantName, customerName, customerEmail, customerPhone, dashboardUrl, imprint } = props;
  return (
    <EmailLayout locale={t.locale} preview={t("email.customerSignup.preview", { restaurant: restaurantName, customer: customerName })}>
      <EmailHeader
        variant="transactional"
        title={t("email.customerSignup.headerTitle", { restaurant: restaurantName })}
        subtitle={customerName}
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{t("email.customerSignup.badge")}</Badge>
        </div>
        <P>{t("email.customerSignup.body")}</P>
        <InfoCard label={t("email.customerSignup.labelCustomer")} accent="emerald">
          <div style={{ fontWeight: 700 }}>{customerName}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{customerEmail}</div>
          {customerPhone && <div style={{ fontSize: 13, marginTop: 2 }}>{customerPhone}</div>}
        </InfoCard>
        <EmailButton href={dashboardUrl}>{t("email.customerSignup.viewCustomersButton")}</EmailButton>
      </EmailBody>
      <EmailFooter restaurantName={restaurantName} imprint={imprint} signOff={t("email.footer.signOff")} poweredByLabel={t("email.footer.poweredBy")} />
    </EmailLayout>
  );
}
