/**
 * Customer-facing reservation confirmation.
 * Emerald status header — same "good news" treatment as OrderConfirmation.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, InfoCard, Badge } from "../components/EmailParts";

export type ReservationConfirmationProps = {
  t: Translator;
  /** "requested" = received, awaiting manual confirmation; "confirmed" =
   *  accepted; "declined" = rejected by the restaurant; "missed" = auto-declined
   *  for not being accepted in time. "missed" reuses the (neutral) "declined"
   *  copy and only swaps the badge word. Drives the copy. */
  status?: "requested" | "confirmed" | "declined" | "missed";
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
  const { t, status = "confirmed", customerName, reservationNumber, restaurantName, dateTime, partySize,
    specialRequests, restaurantAddress, restaurantUrl, restaurantEmail,
    restaurantPhone, imprint } = props;

  // "missed" reuses the neutral "Declined" copy (header "Reservation update",
  // "was not able to accommodate…") — only the badge word differs. Luigi 2026-06-16.
  const suffix = (status === "declined" || status === "missed") ? "Declined" : status === "requested" ? "Requested" : "";
  const k = (base: string) => `email.reservationConfirmed.${base}${suffix}`;
  const statusBadge =
    status === "missed" ? <Badge color="amber">{t("email.reservationConfirmed.badgeMissed")}</Badge>
    : status === "declined" ? <Badge color="rose">{t("email.reservationConfirmed.badgeDeclined")}</Badge>
    : status === "requested" ? <Badge color="slate">{t("email.reservationConfirmed.badgeRequested")}</Badge>
    : <Badge color="emerald">{t("email.reservationConfirmed.badgeConfirmed")}</Badge>;

  return (
    <EmailLayout preview={t("email.reservationConfirmed.preview", { dateTime, partySize: String(partySize) })}>
      <EmailHeader
        variant="status"
        title={t(k("headerTitle"))}
        subtitle={dateTime}
      />
      <EmailBody>
        <P>{t("email.reservationConfirmed.greeting", { customerName })}</P>
        <P>
          {t(k("intro"), { restaurantName })}
        </P>
        <div style={{ margin: "8px 0 16px" }}>
          {statusBadge}{" "}
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

        <P>{t(k("closing"))}</P>
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
