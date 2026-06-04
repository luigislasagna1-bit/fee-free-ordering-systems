/**
 * Scheduled-order "Friendly reminder" email.
 *
 * NEW template — Luigi pointed out GloriaFood has this nudge for
 * scheduled-for-later orders and we didn't. Sent ~15 min before the
 * scheduled delivery/pickup window so the customer is ready when the
 * food arrives.
 *
 * Visual: emerald status header reading "Friendly reminder", scheduled
 * time prominently called out, delivery address card (delivery only),
 * restaurant signature.
 *
 * Hook this in via a cron that runs every minute looking for orders
 * with scheduledFor in the next 15±2 minute window. (TODO: wire when
 * we ship scheduled ordering — for now the template is ready.)
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type ScheduledOrderReminderProps = {
  t: Translator;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  /** Pre-formatted day+time string, e.g. "Wednesday, Dec 24, 04:00 – 04:15 PM" */
  scheduledWindow: string;
  orderType: string;          // "delivery" | "pickup"
  deliveryAddress?: string | null;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function ScheduledOrderReminder(props: ScheduledOrderReminderProps) {
  const {
    t, customerName, orderNumber, restaurantName, scheduledWindow, orderType,
    deliveryAddress, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;
  const isDelivery = orderType === "delivery";

  return (
    <EmailLayout preview={t("email.scheduledReminder.preview", { orderNumber })}>
      <EmailHeader
        variant="status"
        title={t("email.scheduledReminder.headerTitle")}
        subtitle={`Order #${orderNumber}`}
      />
      <EmailBody>
        <P>{t("email.scheduledReminder.greeting", { customerName })}</P>
        <P>
          {t("email.scheduledReminder.bodyPre")}{" "}
          <strong>{scheduledWindow}</strong>{" "}
          {isDelivery
            ? t("email.scheduledReminder.bodyDeliveryPost")
            : t("email.scheduledReminder.bodyPickupPost")}
        </P>

        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{isDelivery ? t("email.scheduledReminder.badgeDelivery") : t("email.scheduledReminder.badgePickup")}</Badge>{" "}
          <Badge color="amber">{t("email.scheduledReminder.badgeScheduled")}</Badge>
        </div>

        {isDelivery && deliveryAddress && (
          <InfoCard label={t("email.scheduledReminder.deliveryAddressLabel")} accent="emerald">
            {deliveryAddress}
          </InfoCard>
        )}

        <P>{isDelivery ? t("email.scheduledReminder.readyDelivery") : t("email.scheduledReminder.readyPickup")}</P>

        <P>{t("email.scheduledReminder.enjoy", { firstName: customerName.split(" ")[0] })}</P>

        <P size="sm" muted>
          {t("email.scheduledReminder.firstTimeNotice")}
        </P>
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
