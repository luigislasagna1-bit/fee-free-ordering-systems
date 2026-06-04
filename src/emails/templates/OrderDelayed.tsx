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
    customerName, orderNumber, restaurantName, newEstimatedReady, delayMinutes, reason,
    trackingUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;

  const etaLabel = newEstimatedReady.toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  const minutesWord = delayMinutes === 1
    ? t("email.orderDelayed.minuteSingular")
    : t("email.orderDelayed.minutePlural");

  return (
    <EmailLayout preview={t("email.orderDelayed.preview", { orderNumber, delayMinutes })}>
      <EmailHeader
        variant="status"
        title={t("email.orderDelayed.title")}
        subtitle={`#${orderNumber}`}
      />
      <EmailBody>
        <P>{t("email.orderDelayed.greeting", { customerName })}</P>
        <P>
          {t("email.orderDelayed.delayBody", { restaurantName, delayMinutes, minutesWord, etaLabel })}
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
      />
    </EmailLayout>
  );
}
