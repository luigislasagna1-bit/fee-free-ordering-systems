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
   *  copy and only swaps the badge word. "cancelled" = the CUSTOMER cancelled
   *  via the emailed link (Fabrizio cms0idtz7). Drives the copy. */
  status?: "requested" | "confirmed" | "declined" | "missed" | "cancelled";
  customerName: string;
  reservationNumber: string;
  restaurantName: string;
  /** Pre-formatted, e.g. "Friday, Dec 24 at 7:30 PM" */
  dateTime: string;
  partySize: number;
  /** Optional restaurant note shown as a card. */
  specialRequests?: string | null;
  /** Deposit was paid — the customer-cancelled email adds the "contact the
   *  restaurant about your deposit" note (v1: no auto-refund). */
  depositPaid?: boolean;
  /** Guest self-cancel page link — italic line on requested/confirmed. */
  cancelUrl?: string;
  /** Booked while the restaurant was CLOSED — "requested" adds the closed-hours
   *  note; opensAtLabel (pre-formatted) names the concrete opening time. */
  bookedWhileClosed?: boolean;
  opensAtLabel?: string | null;
  restaurantAddress?: string | null;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function ReservationConfirmation(props: ReservationConfirmationProps) {
  const { t, status = "confirmed", customerName, reservationNumber, restaurantName, dateTime, partySize,
    specialRequests, depositPaid, cancelUrl, bookedWhileClosed, opensAtLabel, restaurantAddress,
    restaurantUrl, restaurantEmail, restaurantPhone, imprint } = props;

  // "missed" reuses the neutral "Declined" copy (header "Reservation update",
  // "was not able to accommodate…") — only the badge word differs. Luigi 2026-06-16.
  // "Cancelled" = customer-initiated (cms0idtz7) — its own copy set.
  const suffix =
    status === "cancelled" ? "Cancelled"
    : (status === "declined" || status === "missed") ? "Declined"
    : status === "requested" ? "Requested" : "";
  const k = (base: string) => `email.reservationConfirmed.${base}${suffix}`;
  const statusBadge =
    status === "cancelled" ? <Badge color="rose">{t("email.reservationConfirmed.badgeCancelled")}</Badge>
    : status === "missed" ? <Badge color="amber">{t("email.reservationConfirmed.badgeMissed")}</Badge>
    : status === "declined" ? <Badge color="rose">{t("email.reservationConfirmed.badgeDeclined")}</Badge>
    : status === "requested" ? <Badge color="slate">{t("email.reservationConfirmed.badgeRequested")}</Badge>
    : <Badge color="emerald">{t("email.reservationConfirmed.badgeConfirmed")}</Badge>;

  return (
    // Preview follows the STATUS like every other string here (cms0gyexp #2b —
    // a pending request's inbox preview used to read "Reservation confirmed",
    // flatly contradicting its own subject). "" suffix = the confirmed key.
    <EmailLayout preview={t(k("preview"), { dateTime, partySize: String(partySize) })}>
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

        {/* Customer-cancelled a deposit-paid booking: no auto-refund in v1 —
            direct them to the restaurant about the deposit. */}
        {status === "cancelled" && depositPaid && (
          <InfoCard label={t("email.reservationConfirmed.deposit")} accent="amber">
            {t("email.reservationConfirmed.depositContactNote")}
          </InfoCard>
        )}

        {/* Closed-hours note (polish batch — orders got this in cms0gyexp #8):
            only on "requested" — the staff can't confirm until they open, so
            qualify the "we'll be in touch" promise with the concrete time. A
            booking auto-confirmed while closed needs no such caveat. */}
        {status === "requested" && bookedWhileClosed && (
          <P size="sm">
            {opensAtLabel
              ? t("email.reservationConfirmed.closedNoteWithTime", { openingTime: opensAtLabel })
              : t("email.reservationConfirmed.closedNote")}
          </P>
        )}

        <P>{t(k("closing"))}</P>

        {/* Guest self-cancel line (cms0idtz7) — GloriaFood style, whole
            sentence hyperlinked; only on live statuses. The link only OPENS
            the confirm page — cancelling is a POST behind a button. */}
        {cancelUrl && (status === "requested" || status === "confirmed") && (
          <P size="sm" muted>
            <em>
              <a href={cancelUrl} style={{ color: "inherit" }}>
                {t("email.reservationConfirmed.cancelNote")}
              </a>
            </em>
          </P>
        )}
      </EmailBody>
      <EmailFooter
        restaurantName={restaurantName}
        restaurantUrl={restaurantUrl}
        restaurantEmail={restaurantEmail}
        restaurantPhone={restaurantPhone}
        imprint={imprint}
        signOff={t("email.footer.signOff")}
        poweredByLabel={t("email.footer.poweredBy")}
      />
    </EmailLayout>
  );
}
