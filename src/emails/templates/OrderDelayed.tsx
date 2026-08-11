/**
 * Customer-facing "order delayed" email.
 *
 * Fired from POST /api/orders/[id]/delay when the kitchen hits the
 * "+5 / +10 / +15 / Custom" button on the KDS order detail. Tells the
 * customer:
 *   - That their order is running behind
 *   - By how many minutes (so they can decide whether to wait)
 *   - The new estimated ready time (formatted in their browser locale
 *     at render — we ship a Date, the email client doesn't reformat)
 *   - Optionally, a short reason supplied by the kitchen
 *
 * Tone: apologetic but not panicky. The customer paid; they're allowed
 * to know things are slipping.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, InfoCard } from "../components/EmailParts";

export type OrderDelayedProps = {
  t: Translator;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  /** New estimated ready time. Already bumped by delayMinutes when this template renders. */
  newEstimatedReady: Date;
  /** How many minutes the kitchen added on top of the previous ETA. */
  delayMinutes: number;
  /** Optional free-text reason ("kitchen running busy", "out of an ingredient"). */
  reason?: string | null;
  /** Order type — picks the service-specific new-ETA sentence ("new estimated
   *  pickup time" vs "delivery time"). Fabrizio cms0gyexp #15. */
  orderType?: string;
  /** Restaurant IANA timezone — the new-ETA clock MUST be rendered in it, not
   *  the server's UTC. Fabrizio cms0gyexp #16. */
  timezone?: string;
  /** Restaurant 12h/24h preference, same as every other order email. */
  hoursFormat?: "12h" | "24h";
  /** Recipient locale — keeps the clock string consistent with the body copy. */
  locale?: string;
  /** Tracking URL — same status page the rest of the order emails link to. */
  trackingUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

export default function OrderDelayed(props: OrderDelayedProps) {
  const {
    t,
    customerName, orderNumber, restaurantName, newEstimatedReady, delayMinutes, reason, orderType,
    timezone, hoursFormat, locale,
    trackingUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;

  // Service-specific new-ETA sentence: delivery → delivery time, else → pickup
  // time (dine-in/unknown falls back to pickup wording). Fabrizio cms0gyexp #15.
  const delayBodyKey = orderType === "delivery"
    ? "email.orderDelayed.delayBodyDelivery"
    : "email.orderDelayed.delayBodyPickup";

  // 🚨 Format in the RESTAURANT's timezone, never the server's.
  //
  // This was a bare toLocaleString() with no timeZone, so it rendered in the
  // Vercel server's clock (UTC). An Italian restaurant (UTC+2) delaying an
  // order due at 23:06 by 15 minutes emailed the customer "9:21 PM" instead of
  // "23:21" — two hours EARLIER than the original time, which reads as
  // nonsense. The same bug was fixed for the accepted email back in 2026-06-05;
  // this template was missed in that sweep. Fabrizio cms0gyexp #16.
  //
  // Locale + 12h/24h preference now match every other email's clock rendering.
  const etaLabel = newEstimatedReady.toLocaleString(locale || undefined, {
    timeZone: timezone || "UTC",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: hoursFormat === "24h" ? "h23" : "h12",
  });

  const minutesWord = delayMinutes === 1
    ? t("email.orderDelayed.minuteSingular")
    : t("email.orderDelayed.minutePlural");

  return (
    <EmailLayout locale={t.locale} preview={t("email.orderDelayed.preview", { orderNumber, delayMinutes })}>
      <EmailHeader
        variant="status"
        title={t("email.orderDelayed.title")}
        subtitle={`#${orderNumber}`}
      />
      <EmailBody>
        <P>{t("email.orderDelayed.greeting", { customerName })}</P>
        <P>
          {t(delayBodyKey, { restaurantName, delayMinutes, minutesWord, etaLabel })}
        </P>
        {reason && (
          <InfoCard label={t("email.orderDelayed.noteLabel")} accent="amber">
            {reason}
          </InfoCard>
        )}
        <P>
          {t("email.orderDelayed.patience")}
        </P>
        <EmailButton href={trackingUrl}>{t("email.orderDelayed.cta")}</EmailButton>
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
