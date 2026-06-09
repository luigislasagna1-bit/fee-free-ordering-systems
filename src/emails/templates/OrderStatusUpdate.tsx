/**
 * Customer-facing order status update.
 *
 * Sent when the order transitions to a customer-visible status:
 *   - "accepted"   — kitchen took it. THIS is the real confirmation —
 *                    the prior placement-time email only says "received".
 *   - "preparing"  — cooking started
 *   - "ready"      — pickup ready / out for delivery
 *   - "completed"  — delivered / picked up
 *   - "rejected"   — kitchen declined. rejectionReason surfaces here.
 *   - "cancelled"  — restaurant cancelled after accepting.
 *
 * Visual: status-colored header (emerald for positive, rose for negative),
 * status badge, body copy, optional rejection-reason callout, tracking CTA.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { EmailBody, P, EmailButton, Badge, InfoCard } from "../components/EmailParts";

export type OrderStatusUpdateProps = {
  t: Translator;
  customerName: string;
  orderNumber: string;
  restaurantName: string;
  status: string;
  /** Optional human-friendly status sentence — overrides the default for the status. */
  statusMessage?: string;
  /** Restaurant-supplied reason — shown in a callout when status is rejected/cancelled. */
  rejectionReason?: string;
  /** Drives the refund disclosure on rejected/cancelled status emails.
   *  Cash orders get a "no charge was made" line; card → "5-10 business
   *  days back to your card"; PayPal → "released to your PayPal balance
   *  within 3-5 days." Matches GloriaFood's customer expectation that
   *  rejection emails answer the "am I being charged?" question loud
   *  and clear. Luigi 2026-05-31. */
  paidOnline?: boolean;
  paymentMethod?: string;
  trackingUrl: string;
  restaurantUrl?: string;
  restaurantEmail?: string;
  restaurantPhone?: string;
  imprint?: string;
};

type StatusCopyKeys = {
  titleKey: string;
  bodyKey: string;
  badgeKey: string;
  badgeColor: "emerald" | "amber" | "rose" | "sky";
  isNegative: boolean;
};

const STATUS_COPY_KEYS: Record<string, StatusCopyKeys> = {
  accepted: {
    titleKey: "email.orderStatus.acceptedTitle",
    bodyKey: "email.orderStatus.acceptedBody",
    badgeKey: "email.orderStatus.acceptedBadge",
    badgeColor: "emerald", isNegative: false,
  },
  preparing: {
    titleKey: "email.orderStatus.preparingTitle",
    bodyKey: "email.orderStatus.preparingBody",
    badgeKey: "email.orderStatus.preparingBadge",
    badgeColor: "emerald", isNegative: false,
  },
  ready: {
    titleKey: "email.orderStatus.readyTitle",
    bodyKey: "email.orderStatus.readyBody",
    badgeKey: "email.orderStatus.readyBadge",
    badgeColor: "emerald", isNegative: false,
  },
  completed: {
    titleKey: "email.orderStatus.completedTitle",
    bodyKey: "email.orderStatus.completedBody",
    badgeKey: "email.orderStatus.completedBadge",
    badgeColor: "emerald", isNegative: false,
  },
  rejected: {
    titleKey: "email.orderStatus.rejectedTitle",
    bodyKey: "email.orderStatus.rejectedBody",
    badgeKey: "email.orderStatus.rejectedBadge",
    badgeColor: "rose", isNegative: true,
  },
  cancelled: {
    titleKey: "email.orderStatus.cancelledTitle",
    bodyKey: "email.orderStatus.cancelledBody",
    badgeKey: "email.orderStatus.cancelledBadge",
    badgeColor: "rose", isNegative: true,
  },
};

export default function OrderStatusUpdate(props: OrderStatusUpdateProps) {
  const {
    t,
    customerName, orderNumber, restaurantName, status, statusMessage, rejectionReason,
    paidOnline, paymentMethod,
    trackingUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;
  const normalized = status.toLowerCase();
  // Map "canceled" (US) → "cancelled" (UK) so both spellings hit the same copy.
  const key = normalized === "canceled" ? "cancelled" : normalized;
  // A timed-out order is auto-rejected (rejectionReason starts with
  // "Auto-rejected") — relabel the badge MISSED (the kitchen's word, already
  // translated in all 38 locales) and hide the internal reason text from the
  // customer. Same rule as the kitchen + the status page. Luigi 2026-06-09.
  const isMissed = normalized === "rejected" && (rejectionReason ?? "").trim().startsWith("Auto-rejected");
  const copyKeys: StatusCopyKeys | undefined = STATUS_COPY_KEYS[key];
  const title = copyKeys ? t(copyKeys.titleKey) : t("email.orderStatus.fallbackTitle");
  const body = copyKeys ? t(copyKeys.bodyKey) : t("email.orderStatus.fallbackBody");
  const badge = isMissed ? t("kitchen.missed") : (copyKeys ? t(copyKeys.badgeKey) : status);
  const badgeColor = copyKeys?.badgeColor ?? "sky";
  const isNegative = copyKeys?.isNegative ?? false;
  const reason = rejectionReason?.trim();

  // Refund disclosure shown ONLY on rejected/cancelled emails. Customer's
  // first question on a rejection is always "what about my money?" — we
  // answer it explicitly per payment method, mirroring GloriaFood's
  // explicit refund language. When we can't tell what they paid with
  // (legacy callers, missing payment fields) we fall back to the generic
  // "if you paid online…" line.
  const isCardPay = paymentMethod === "card" || paymentMethod === "online_card";
  const isPaypal = paymentMethod === "paypal";
  const isCashIsh = paymentMethod === "cash" || paymentMethod === "card_in_person";
  const refundCopy = isNegative
    ? isCashIsh || paidOnline === false
      ? t("email.orderStatus.refundCash")
      : isCardPay
        ? t("email.orderStatus.refundCard")
        : isPaypal
          ? t("email.orderStatus.refundPaypal")
          : paidOnline === true
            ? t("email.orderStatus.refundGeneric")
            : null
    : null;

  return (
    <EmailLayout preview={`${t("email.orderStatus.previewPrefix", { orderNumber })} — ${title}`}>
      <EmailHeader variant="status" title={title} subtitle={`${t("email.orderStatus.orderLabel")} #${orderNumber}`} />
      <EmailBody>
        <P>{t("email.orderStatus.greeting", { customerName })}</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color={badgeColor}>{badge}</Badge>
        </div>
        <P>{statusMessage ?? body}</P>
        {isNegative && reason && !isMissed && (
          <InfoCard label={t("email.orderStatus.reasonLabel")} accent="rose">
            {reason}
          </InfoCard>
        )}
        {refundCopy && (
          <InfoCard label={t("email.orderStatus.paymentLabel")} accent="amber">
            {refundCopy}
          </InfoCard>
        )}
        {isNegative && restaurantPhone && (
          // Lifted from the footer onto a prominent body line on
          // negative-status emails (rejected / cancelled). A customer
          // whose order was just turned down or cancelled is most
          // likely to want to call the restaurant — making them scroll
          // past the refund disclosure to find the number was a fair
          // gripe from Fabrizio (2026-06-01).
          <P>{t("email.orderStatus.callUs", { restaurantName, phone: restaurantPhone })}</P>
        )}
        {!isNegative && (
          <EmailButton href={trackingUrl}>{t("email.orderStatus.trackingCta")}</EmailButton>
        )}
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
