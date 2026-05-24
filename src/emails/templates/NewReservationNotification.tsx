/**
 * Restaurant-facing new-reservation ping.
 * Navy transactional header like KitchenNotification.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";

export type NewReservationNotificationProps = {
  restaurantName: string;
  reservationNumber: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  dateTime: string;
  partySize: number;
  specialRequests?: string | null;
  dashboardUrl: string;
  imprint?: string;
};

export default function NewReservationNotification(props: NewReservationNotificationProps) {
  const { restaurantName, reservationNumber, customerName, customerPhone,
    customerEmail, dateTime, partySize, specialRequests, dashboardUrl,
    imprint } = props;

  return (
    <EmailLayout preview={`New reservation — ${dateTime} · party of ${partySize}`}>
      <EmailHeader
        variant="transactional"
        title={`${restaurantName} — Reservation #${reservationNumber}`}
        subtitle="New reservation request"
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">New</Badge>{" "}
          <Badge color="slate">Party of {partySize}</Badge>
        </div>

        <div style={{ margin: "0 0 6px" }}>
          <strong style={{ fontSize: 16 }}>{customerName}</strong>
        </div>
        {customerPhone && (
          <div style={{ fontSize: 14, marginBottom: 2 }}>
            <a href={`tel:${customerPhone.replace(/[^0-9+]/g, "")}`} style={{ color: "#059669", textDecoration: "none" }}>
              {customerPhone}
            </a>
          </div>
        )}
        {customerEmail && (
          <div style={{ fontSize: 14, marginBottom: 8 }}>
            <a href={`mailto:${customerEmail}`} style={{ color: "#059669", textDecoration: "none" }}>
              {customerEmail}
            </a>
          </div>
        )}

        <InfoCard label="Reservation time" accent="emerald">
          <strong>{dateTime}</strong>
        </InfoCard>

        {specialRequests && (
          <InfoCard label="Special requests" accent="amber">
            {specialRequests}
          </InfoCard>
        )}

        <EmailButton href={dashboardUrl}>Manage reservation</EmailButton>
      </EmailBody>
      <EmailFooter imprint={imprint} />
    </EmailLayout>
  );
}
