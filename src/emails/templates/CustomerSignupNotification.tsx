/**
 * STAFF-facing "a new customer signed up" ping (Luigi 2026-07-11) — fired by
 * the per-restaurant account signup route, gated on the NotificationRecipient
 * `customerSignup` toggle (default OFF). Staff email bodies are English-only
 * by design; the SUBJECT is localized in the sender (email.ts convention).
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type CustomerSignupNotificationProps = {
  restaurantName: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  dashboardUrl: string;
  imprint?: string;
};

export default function CustomerSignupNotification(props: CustomerSignupNotificationProps) {
  const { restaurantName, customerName, customerEmail, customerPhone, dashboardUrl, imprint } = props;
  return (
    <EmailLayout preview={`${restaurantName} — new customer account: ${customerName}`}>
      <EmailHeader
        variant="transactional"
        title={`${restaurantName} — new customer account`}
        subtitle={customerName}
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">New sign-up</Badge>
        </div>
        <P>A new customer just created an account at your restaurant.</P>
        <InfoCard label="Customer" accent="emerald">
          <div style={{ fontWeight: 700 }}>{customerName}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>{customerEmail}</div>
          {customerPhone && <div style={{ fontSize: 13, marginTop: 2 }}>{customerPhone}</div>}
        </InfoCard>
        <EmailButton href={dashboardUrl}>View customers in admin</EmailButton>
      </EmailBody>
      <EmailFooter restaurantName={restaurantName} imprint={imprint} />
    </EmailLayout>
  );
}
