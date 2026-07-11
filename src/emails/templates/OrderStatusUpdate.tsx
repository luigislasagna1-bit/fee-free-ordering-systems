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
  /** PRE-FORMATTED store-credit amount (e.g. "$5.00") returned to the wallet
   *  when this order was rejected/cancelled. The reject/refund paths release
   *  the spent credit (releaseRewardForOrder), but the email used to stay
   *  silent — a fully-bucks-paid customer even read "nothing to refund"
   *  while their wallet had been debited (audit 2026-07-11). Only pass when
   *  the restaurant's rewards feature is ON and credit was actually used. */
  creditReturned?: string;
  /** Restaurant's reward label ("Pizza Bucks") — required with creditReturned. */
  rewardLabel?: string | null;
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
    paidOnline, paymentMethod, creditReturned, rewardLabel,
    trackingUrl, restaurantUrl, restaurantEmail, restaurantPhone, imprint,
  } = props;
  const normalized = status.toLowerCase();
  // Map "canceled" (US) → "cancelled" (UK) so both spellings hit the same copy.
  const key = normalized === "canceled" ? "cancelled" : normalized;
  // A timed-out order is auto-rejected (rejectionReason starts with
  // "Auto-rejected") — that's a MISSED order, not a refusal (Fabrizio
  // cmr6meaaq: the two mean different things). Badge, title AND body all
  // use the missed wording; the internal reason text stays hidden. Same
  // rule as the kitchen + the status page. Luigi 2026-06-09 / 2026-07-04.
  const isMissed = normalized === "rejected" && (rejectionReason ?? "").trim().startsWith("Auto-rejected");
  const copyKeys: StatusCopyKeys | undefined = STATUS_COPY_KEYS[key];
  const title = isMissed
    ? t("email.orderStatus.missedTitle")
    : copyKeys ? t(copyKeys.titleKey) : t("email.orderStatus.fallbackTitle");
  const body = isMissed
    ? t("email.orderStatus.missedBody")
    : copyKeys ? t(copyKeys.bodyKey) : t("email.orderStatus.fallbackBody");
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
  // Fully store-credit-paid: the wallet WAS debited, so the method-based copy
  // must not run — "no payment was taken, nothing to refund" was a lie for
  // these orders. The credit-returned card below tells the real story.
  const isFullyCredit = paymentMethod === "reward_credit";
  const refundCopy = isNegative && !isFullyCredit
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
  // Store-credit part (or all) of the payment — returned to the wallet on
  // rejection/cancellation. Rides ALONGSIDE the method copy for part-paid
  // orders (card/cash portion refunds per method; bucks go back to wallet).
  const creditCopy = isNegative && creditReturned
    ? t("email.orderStatus.creditReturned", { label: rewardLabel || "", amount: creditReturned })
    : null;

  return (
    <EmailLayout preview={`${t("email.orderStatus.previewPrefix", { orderNumber })} — ${title}`}>
      <EmailHeader variant="status" title={title} subtitle={`${t("email.orderStatus.orderLabel")} #${orderNumber}`} />
      <EmailBody>
        <P>{t("email.orderStatus.greeting", { customerName })}</P>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color={badgeColor}>{badge}</Badge>
        </div>
        {/* Always the localized per-status copy. The estimated-ready suffix
            only rides POSITIVE updates — a rejected/missed email used to say
            "your order is now rejected. Estimated ready: 10:00" because the
            dispatcher's raw-status sentence overrode this body entirely
            (Fabrizio cmr6meaaq, 2026-07-04). */}
        <P>{body}{!isNegative && statusMessage ? ` ${statusMessage}` : ""}</P>
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
        {creditCopy && (
          <InfoCard label={t("email.orderStatus.paymentLabel")} accent="emerald">
            {creditCopy}
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
