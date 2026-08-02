/**
 * Restaurant-facing new-reservation ping.
 * Navy transactional header like KitchenNotification.
 *
 * FULLY LOCALIZED ×38 (Fabrizio cms0gyexp #1 — policy flip, Luigi 2026-07-29):
 * staff email bodies now follow the recipient's emailLanguage like the
 * customer templates do. Keys live under email.newReservation.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard, Badge } from "../components/EmailParts";
import { formatDetailRows, type ReservationDetails } from "@/lib/reservation-details";

export type NewReservationNotificationProps = {
  t: Translator;
  restaurantName: string;
  reservationNumber: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  dateTime: string;
  partySize: number;
  specialRequests?: string | null;
  /** Smart buttons (Fabrizio cmsajnvkm): adults/children split + structured
   *  details. All optional — legacy bookings render exactly as before. */
  adultsCount?: number | null;
  childrenCount?: number | null;
  details?: ReservationDetails | null;
  dashboardUrl: string;
  /** The CUSTOMER cancelled this booking via their emailed link (cms0idtz7)
   *  — flips the ping to "cancelled" wording. */
  cancelled?: boolean;
  imprint?: string;
};

export default function NewReservationNotification(props: NewReservationNotificationProps) {
  const { t, restaurantName, reservationNumber, customerName, customerPhone,
    customerEmail, dateTime, partySize, specialRequests, adultsCount,
    childrenCount, details, dashboardUrl, cancelled, imprint } = props;
  const party = String(partySize);
  const detailRows = formatDetailRows(details, t, "email.newReservation");

  return (
    <EmailLayout preview={cancelled
      ? t("email.newReservation.previewCancelled", { dateTime, partySize: party })
      : t("email.newReservation.preview", { dateTime, partySize: party })}>
      <EmailHeader
        variant="transactional"
        title={t("email.newReservation.headerTitle", { restaurant: restaurantName, reservationNumber })}
        subtitle={cancelled
          ? t("email.newReservation.subtitleCancelled")
          : t("email.newReservation.subtitleNew")}
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          {cancelled
            ? <Badge color="rose">{t("email.newReservation.badgeCancelled")}</Badge>
            : <Badge color="emerald">{t("email.newReservation.badgeNew")}</Badge>}{" "}
          <Badge color="slate">{t("email.newReservation.badgeParty", { partySize: party })}</Badge>{" "}
          {adultsCount != null && (
            <Badge color="slate">
              {t("email.newReservation.badgeAdultsChildren", { adults: adultsCount, children: childrenCount ?? 0 })}
            </Badge>
          )}
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

        <InfoCard label={t("email.newReservation.labelTime")} accent={cancelled ? "rose" : "emerald"}>
          <strong>{dateTime}</strong>
        </InfoCard>

        {cancelled && (
          <P size="sm" muted>
            {t("email.newReservation.cancelledNote")}
          </P>
        )}

        {detailRows.map((row) => (
          <InfoCard key={row.label} label={row.label} accent="amber">
            {row.value}
          </InfoCard>
        ))}

        {specialRequests && (
          <InfoCard label={t("email.newReservation.labelSpecialRequests")} accent="amber">
            {specialRequests}
          </InfoCard>
        )}

        <EmailButton href={dashboardUrl}>{t("email.newReservation.manageButton")}</EmailButton>
      </EmailBody>
      <EmailFooter imprint={imprint} signOff={t("email.footer.signOff")} poweredByLabel={t("email.footer.poweredBy")} />
    </EmailLayout>
  );
}
