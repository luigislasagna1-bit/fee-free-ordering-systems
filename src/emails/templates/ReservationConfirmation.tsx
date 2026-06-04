/**
 * Customer-facing reservation confirmation.
 * Emerald status header — same "good news" treatment as OrderConfirmation.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type ReservationConfirmationProps = {
  t: Translator;
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
  const { t, customerName, reservationNumber, restaurantName, dateTime, partySize,
    specialRequests, restaurantAddress, restaurantUrl, restaurantEmail,
    restaurantPhone, imprint } = props;

  return (
    <EmailLayout preview={t("email.reservationConfirmed.preview", { dateTime, partySize: String(partySize) })}>
      <EmailHeader
        variant="status"
        title={t("email.reservationConfirmed.headerTitle")}
        subtitle={dateTime}
      />
      <EmailBody>
        <P>{t("email.reservationConfirmed.greeting", { customerName })}</P>
        <P>
          {t("email.reservationConfirmed.intro", { restaurantName: `<strong>${restaurantName}</strong>` })}
        </P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{t("email.reservationConfirmed.badgeConfirmed")}</Badge>{" "}
          <Badge color="slate">{t("email.reservationConfirmed.badgeReservation", { reservationNumber })}</Badge>
        </div>

        <InfoCard label={t("email.reservationConfirmed.labelWhen")} accent="emerald">
          <div><strong>{dateTime}</strong></div>
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            {t("email.reservationConfirmed.partySize", { partySize: String(partySize) })}
          </div>
        </InfoCard>

        {restaurantAddress && (
          <InfoCard label={t("email.reservationConfirmed.labelWhere")}>
            {restaurantAddress}
          </InfoCard>
        )}

        {specialRequests && (
          <InfoCard label={t("email.reservationConfirmed.labelSpecialRequests")} accent="amber">
            {specialRequests}
          </InfoCard>
        )}

        <P>{t("email.reservationConfirmed.closing")}</P>
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
