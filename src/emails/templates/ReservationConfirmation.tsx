/**
 * Customer-facing reservation confirmation.
 * Emerald status header — same "good news" treatment as OrderConfirmation.
 */
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type ReservationConfirmationProps = {
  customerName: string;
  reservationNumber: string;
  restaurantName: string;
  /** Pre-formatted, e.g. "Friday, Dec 24 at 7:30 PM" */
  dateTime: string;
  partySize: number;
  /** Optional restaurant note shown as a card. */
  specialRequests?: string | null;
  restaurantAddress?: string | null;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function ReservationConfirmation(props: ReservationConfirmationProps) {
  const { customerName, reservationNumber, restaurantName, dateTime, partySize,
    specialRequests, restaurantAddress, restaurantUrl, restaurantEmail,
    restaurantPhone, imprint } = props;

  return (
    <EmailLayout preview={`Reservation confirmed — ${dateTime} for ${partySize}`}>
      <EmailHeader
        variant="status"
        title="Reservation confirmed"
        subtitle={dateTime}
      />
      <EmailBody>
        <P>Hello {customerName},</P>
        <P>
          Your reservation at <strong>{restaurantName}</strong> is confirmed.
        </P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">Confirmed</Badge>{" "}
          <Badge color="slate">Reservation #{reservationNumber}</Badge>
        </div>

        <InfoCard label="When" accent="emerald">
          <div><strong>{dateTime}</strong></div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            Party of {partySize}
          </div>
        </InfoCard>

        {restaurantAddress && (
          <InfoCard label="Where">
            {restaurantAddress}
          </InfoCard>
        )}

        {specialRequests && (
          <InfoCard label="Special requests" accent="amber">
            {specialRequests}
          </InfoCard>
        )}

        <P>We look forward to seeing you. If your plans change, please contact us as soon as possible using the details below.</P>
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
