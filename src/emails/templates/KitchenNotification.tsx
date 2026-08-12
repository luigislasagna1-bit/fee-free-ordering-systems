/**
 * Restaurant-facing new-order notification email.
 *
 * GloriaFood-inspired (the "Luigi's Lasagna - MILTON - Order #..." example):
 *   - Dark navy header with restaurant name + order number
 *   - Two big stats up front: order type + total (paid status)
 *   - Customer contact line (name, phone, email)
 *   - Full itemized order with modifiers + customer notes
 *   - Subtotal + tax + total
 *   - CTA to view in admin dashboard
 *
 * Sent to: restaurant's notification recipients
 * Triggered by: new order placed (BEFORE acceptance) — this is the "you
 * have a new order" ping to the kitchen.
 *
 * FULLY LOCALIZED ×38 (Fabrizio cms0gyexp #1 — policy flip, Luigi 2026-07-29):
 * staff bodies now follow the recipient's emailLanguage. Keys under
 * email.newOrder; totals rows reuse receipt.customer.* exactly like the
 * customer OrderConfirmation template.
 */
import type { Translator } from "@/lib/i18n-dict";
import { EmailLayout, EmailHeader, EmailFooter } from "../components/EmailLayout";
import { formatCurrency } from "@/lib/utils";
import {
  EmailBody, P, EmailButton, Badge,
  OrderItemsTable, OrderTotals, EmailOrderItem, InfoCard, TimingBlock,
} from "../components/EmailParts";

export type KitchenNotificationProps = {
  t: Translator;
  restaurantName: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  orderType?: string;
  estimatedMinutes?: number;
  /** PRE-FORMATTED order-timing facts — same block the customer email shows, so
   *  staff and customer read identical times. Luigi 2026-08-07. */
  placedAtLabel?: string | null;
  prepTimeLabel?: string | null;
  readyAtLabel?: string | null;
  readyRowLabel?: string | null;
  scheduledLabel?: string | null;
  paidOnline?: boolean;
  /** Raw payment method ("cash" | "card_in_person" | …) — when the order is
   *  NOT paid online, the chip says WHAT to collect so a delivery driver
   *  knows to bring the card terminal (Luigi 2026-07-04, ord #238064650). */
  paymentMethod?: string;
  /** Reserve-then-order: the table booking attached to this order. When set,
   *  the store email flags "Table reserved for N — <date> <time>". */
  reservationPartySize?: number | null;
  reservationLabel?: string | null;
  /** Full itemized order. Optional — older call sites that don't have items
   *  pass `total` only; the template degrades to a "View order in admin"
   *  prompt instead of rendering an empty table. */
  items?: EmailOrderItem[];
  subtotal?: number;
  taxAmount?: number;
  taxLabel?: string;
  deliveryFee?: number;
  /** The fee a free-delivery promo waived. A waived fee is stored as 0 and a $0
   *  row is hidden, so without this the promo left no trace on the staff email —
   *  it read as though delivery had been forgotten. When set, the row renders as
   *  the original struck through plus FREE. Luigi 2026-07-31. */
  savedDeliveryFee?: number;
  tip?: number;
  depositTotal?: number;
  discount?: number;
  /** Each promo behind `discount`, so staff can see WHICH specials a customer
   *  used instead of one lumped figure. Luigi 2026-08-11. */
  discountBreakdown?: Array<{ name?: string; amount?: number; couponCode?: string }>;
  /** Per-order service/other fees (parsed [{name, amount}]) — named rows so
   *  the staff email's totals reconcile to Total. 2026-07-11. */
  serviceFees?: Array<{ name?: string; amount?: number }>;
  total: number;
  deliveryAddress?: string | null;
  customerNotes?: string | null;
  dashboardUrl: string;
  imprint?: string;
  currency?: string;
  /** Reward Dollars (store credit) the customer paid with — when > 0 the
   *  totals add "Paid with {rewardLabel} −$X" + a bold "To collect"/
   *  "Collected" row so staff never read the Total and over-collect
   *  (Luigi 2026-07-02). Only sent when the rewards program is ON. */
  creditApplied?: number;
  rewardLabel?: string | null;
  /** Projected credit the customer EARNS on this order — so the staff copy of
   *  the receipt matches the customer's. Luigi 2026-08-07. */
  rewardEarned?: number;
  /** Headline shown in the header subtitle + the lead badge. Defaults to
   *  the localized "New order" (the placement ping). The acceptance/
   *  confirmation email passes a localized "Order confirmed" so staff can
   *  tell a confirmation apart from a brand-new order at a glance. */
  headline?: string;
  /** The "Accept this order… auto-reject runs" hint — true on the placement
   *  ping only. The acceptance email passes false: telling staff to accept
   *  an ALREADY-ACCEPTED order was nonsense (spotted on Luigi's live test,
   *  cms0gyexp). */
  showAcceptHint?: boolean;
};

export default function KitchenNotification(props: KitchenNotificationProps) {
  const {
    t, restaurantName, orderNumber, customerName, customerPhone, customerEmail,
    orderType, estimatedMinutes, placedAtLabel, prepTimeLabel, readyAtLabel, readyRowLabel, scheduledLabel, paidOnline, paymentMethod, reservationPartySize, reservationLabel, items, subtotal, taxAmount,
    taxLabel, deliveryFee, savedDeliveryFee, tip, depositTotal, discount, discountBreakdown, serviceFees, total, deliveryAddress,
    customerNotes, dashboardUrl, imprint, currency, headline,
    creditApplied, rewardLabel, rewardEarned, showAcceptHint = true,
  } = props;
  const leadLabel = headline ?? t("email.newOrder.badgeNew");
  // Localized order-type chip — keyed by the raw DB value; unknown values
  // (e.g. legacy "curbside") degrade to the raw slug rather than crashing.
  const typeKeyed = orderType ? t(`receipt.orderTypes.${orderType}`) : null;
  const orderTypeLabel = typeKeyed && !typeKeyed.startsWith("receipt.") ? typeKeyed : orderType ?? null;
  const hasItems = items && items.length > 0;
  const rewardUsed = Math.max(0, Number(creditApplied ?? 0));
  // Staff copy shows what the customer EARNED too, so the two receipts for the
  // same order finally match — the customer's said "You earned $4.20" while the
  // kitchen's said nothing. Luigi 2026-08-07.
  const rewardEarnedAmt = Math.max(0, Number(rewardEarned ?? 0));
  const toCollect = Math.round(Math.max(0, total - rewardUsed) * 100) / 100;
  const rewardName = rewardLabel?.trim() || t("email.newOrder.creditFallback");
  const collectLabel = paidOnline ? t("email.newOrder.collected") : t("email.newOrder.toCollect");
  const totalFmt = formatCurrency(total, currency ?? "usd");

  return (
    <EmailLayout locale={t.locale} preview={t("email.newOrder.preview", { restaurant: restaurantName, orderNumber, total: totalFmt })}>
      <EmailHeader
        variant="transactional"
        title={t("email.newOrder.headerTitle", { restaurant: restaurantName, orderNumber })}
        subtitle={`${leadLabel}${orderTypeLabel ? ` · ${orderTypeLabel}` : ""}${estimatedMinutes ? ` · ${estimatedMinutes} ${t("email.newOrder.minShort")}` : ""}`}
      />
      <EmailBody>
        <div style={{ margin: "8px 0 16px" }}>
          <Badge color="emerald">{leadLabel}</Badge>{" "}
          {orderTypeLabel && <><Badge color="slate">{orderTypeLabel}</Badge>{" "}</>}
          {typeof paidOnline === "boolean" && (
            <Badge color={paidOnline ? "sky" : "amber"}>
              {paidOnline
                ? t("email.newOrder.badgePaidOnline")
                : paymentMethod === "card_in_person"
                  ? t("email.newOrder.badgeCollectCard")
                  : paymentMethod === "cash"
                    ? t("email.newOrder.badgeCollectCash")
                    : t("email.newOrder.badgePayAtStore")}
            </Badge>
          )}
        </div>

        {/* Order timing — placed / prep / ready, with a loud SCHEDULED banner
            for future orders. This is the line that stops a kitchen cooking a
            next-day order immediately. Same block, same values, as the
            customer's email. Luigi 2026-08-07 (GloriaFood parity). */}
        <TimingBlock
          locale={t.locale}
          scheduledBadge={scheduledLabel ? t("email.timing.scheduledBanner") : null}
          rows={[
            { label: t("email.timing.placedAt"), value: placedAtLabel },
            { label: t("email.timing.prepTime"), value: prepTimeLabel },
            { label: readyRowLabel ?? t("email.timing.readyTime"), value: readyAtLabel, emphasis: true },
          ]}
        />

        {/* Reserve-then-order: flag the table booking right at the top so the
            store sees "table reservation + pre-order". */}
        {reservationLabel && reservationPartySize != null && (
          <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: 8, background: "#f3e8ff", border: "1px solid #e9d5ff" }}>
            <strong style={{ color: "#6b21a8" }}>
              🪑 {reservationPartySize === 1
                ? t("email.newOrder.tablePreorderOne", { time: reservationLabel })
                : t("email.newOrder.tablePreorder", { partySize: String(reservationPartySize), time: reservationLabel })}
            </strong>
          </div>
        )}

        {/* Customer contact block */}
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

        {orderType === "delivery" && deliveryAddress && (
          <InfoCard label={t("email.newOrder.labelDeliveryAddress")} accent="emerald">
            {deliveryAddress}
          </InfoCard>
        )}

        {customerNotes && (
          <InfoCard label={t("email.newOrder.labelCustomerNotes")} accent="amber">
            {/* Structural <br/> split, not white-space CSS: Outlook desktop's
                Word engine ignores white-space and would glue the delivery
                instructions + order note onto one line. */}
            {customerNotes.split("\n").map((ln, i) => (
              <span key={i}>{i > 0 && <br />}{ln}</span>
            ))}
          </InfoCard>
        )}

        {hasItems ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280", marginTop: 20, marginBottom: 4 }}>
              {t("email.newOrder.labelOrderDetails")}
            </div>
            <OrderItemsTable locale={t.locale} items={items!} currency={currency ?? "usd"} />
            <OrderTotals
              locale={t.locale}
              subtotal={subtotal ?? total}
              taxAmount={taxAmount}
              taxLabel={taxLabel ?? t("receipt.customer.tax")}
              deliveryFee={deliveryFee}
              savedDeliveryFee={savedDeliveryFee}
              // Reuses the customer email's existing FREE label, already
              // translated in all 38 locales — a new key here would have shipped
              // a raw key path to every non-English recipient.
              freeLabel={t("email.orderConfirmed.promoFreeLabel")}
              tip={tip}
              depositTotal={depositTotal}
              discount={discount}
              discountBreakdown={discountBreakdown}
              serviceFees={serviceFees}
              total={total}
              currency={currency ?? "usd"}
              subtotalLabel={t("receipt.customer.subtotal")}
              deliveryFeeLabel={t("receipt.customer.deliveryFee")}
              tipLabel={t("receipt.customer.tip")}
              discountLabel={t("receipt.customer.promoDiscount")}
              totalLabel={t("receipt.customer.total")}
              rewardUsed={rewardUsed}
              rewardUsedLabel={t("email.newOrder.paidWith", { label: rewardName })}
              rewardEarned={rewardEarnedAmt}
              rewardEarnedLabel={t("receipt.customer.earnedReward", { label: rewardName })}
              balanceDue={toCollect}
              balanceDueLabel={collectLabel}
            />
          </>
        ) : (
          // Fallback: caller didn't pass items (legacy senders + the
          // acceptance/confirmation email). Show the total — and when store
          // credit part-paid, the amount actually collected — then direct
          // them to the admin for the full breakdown.
          <InfoCard label={rewardUsed > 0 ? collectLabel : t("email.newOrder.labelOrderTotal")} accent="slate">
            <strong style={{ fontSize: 18 }}>{formatCurrency(rewardUsed > 0 ? toCollect : total, currency ?? "usd")}</strong>
            {rewardUsed > 0 && (
              <div style={{ fontSize: 13, color: "#047857", marginTop: 4, fontWeight: 600 }}>
                {t("email.newOrder.totalMinusCredit", {
                  total: totalFmt,
                  credit: formatCurrency(rewardUsed, currency ?? "usd"),
                  label: rewardName,
                })}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              {t("email.newOrder.seeBreakdown")}
            </div>
          </InfoCard>
        )}

        <EmailButton href={dashboardUrl}>{t("email.newOrder.openKitchenApp")}</EmailButton>

        {showAcceptHint && (
          <P size="sm" muted>
            {t("email.newOrder.acceptHint")}
          </P>
        )}
      </EmailBody>
      <EmailFooter imprint={imprint} signOff={t("email.footer.signOff")} poweredByLabel={t("email.footer.poweredBy")} />
    </EmailLayout>
  );
}
