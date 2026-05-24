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
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type ScheduledOrderReminderProps = {
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
    customerName, orderNumber, restaurantName, scheduledWindow, orderType,
    deliveryAddress, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;
  const isDelivery = orderType === "delivery";

  return (
    <EmailLayout preview={`Friendly reminder — your order #${orderNumber} is on the way`}>
      <EmailHeader
        variant="status"
        title="Friendly reminder"
        subtitle={`Order #${orderNumber}`}
      />
      <EmailBody>
        <P>Hello {customerName},</P>
        <P>
          Your scheduled order for <strong>{scheduledWindow}</strong> is{" "}
          {isDelivery ? "on its way" : "almost ready for pickup"}.
        </P>

        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{isDelivery ? "Delivery" : "Pickup"}</Badge>{" "}
          <Badge color="amber">Scheduled</Badge>
        </div>

        {isDelivery && deliveryAddress && (
          <InfoCard label="Your delivery address" accent="emerald">
            {deliveryAddress}
          </InfoCard>
        )}

        <P>{isDelivery ? "Please be there when we deliver." : "Please be on time to pick up your order."}</P>

        <P>Enjoy, {customerName.split(" ")[0]}!</P>

        <P size="sm" muted>
          If you are a first-time customer you may receive a phone call to verify your details.
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
