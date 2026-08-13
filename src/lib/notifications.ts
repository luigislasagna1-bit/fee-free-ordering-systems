/**
 * Central notification dispatcher.
 *
 * Every place in the codebase that wants to send an email goes through ONE of
 * these helpers (`notifyStaff` for restaurant-side emails to NotificationRecipient
 * rows, `notifyCustomer` for the customer who placed an order). The helpers:
 *
 *   1. Look up the relevant toggle for the event.
 *   2. Skip the send entirely if the toggle is off.
 *   3. Fan out to every active recipient (staff) using each recipient's
 *      `emailLanguage` preference.
 *   4. Pass the restaurant's reseller imprint into the email template so
 *      white-labeled restaurants show the reseller's brand in the footer
 *      instead of "Fee Free Ordering Systems".
 *
 * This module is the only place that maps event names → email functions →
 * toggle fields. Every trigger site stays clean:
 *
 *     await notifyStaff({ restaurantId, event: "newOrder", payload: {...} });
 *
 * Errors are caught internally; callers don't need their own `.catch()`.
 */

import prisma from "@/lib/db";
import { formatTime } from "@/lib/format-time";
import { formatCurrency } from "@/lib/utils";
import { collectedOf } from "@/lib/reports/collected";
import {
  sendNewOrderNotificationEmail,
  sendCustomerSignupNotificationEmail,
  sendOrderAcceptedNotificationEmail,
  sendNewReservationNotification,
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
  sendOrderDelayedEmail,
  sendOrderRejectedEmail,
  sendOrderCanceledEmail,
  sendDispatchRejectedEmail,
  sendReservationConfirmation,
  setEmailImprint,
  setEmailLogoUrl,
} from "@/lib/email";
import type { EmailOrderItem } from "@/emails/components/EmailParts";
import { sendSms } from "@/lib/sms";
import { getDict } from "@/lib/i18n-dict";
import { sendCustomerPush, customerWantsOrderPush } from "@/lib/customer-push";
import { hasFeature } from "@/lib/entitlements";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { signActionToken } from "@/lib/order-status-token";

/**
 * Build a short SMS body for a customer order event, IN THE CUSTOMER'S OWN
 * LANGUAGE. Every body comes from the `sms.*` namespace in
 * src/messages/<locale>.json — never a hardcoded English literal, which is
 * what this builder shipped with until 2026-08-11 (harmless only because no
 * restaurant had bought the `customer_sms` / `app_store_listing` add-ons yet).
 * The same bodies feed branded-app PUSH notifications, so both channels speak
 * the same language as the customer's emails.
 *
 * Cap-160 friendly (single-segment) for the common shapes in EVERY locale —
 * src/lib/sms-i18n.test.ts holds the line; the SMS sender enforces a 320-char
 * hard cap as a safety net. We deliberately avoid putting the tracking URL in
 * pickup-ready / delivery-ready texts because most customers tap the link,
 * which then defeats the "the page already told you" assumption — keep the
 * texts informational + actionable.
 *
 * Adding a shape = add a key to `sms.*` in ALL 38 locales (see
 * scripts/i18n-add-sms-keys.ts) — an English-only string here is a regression.
 */
async function buildCustomerSms(
  restaurantName: string,
  payload: CustomerEventPayload,
  hoursFormat: "12h" | "24h" = "24h",
  timezone?: string,
  /** The customer's language — same value the emails are rendered in. */
  locale?: string,
): Promise<string | null> {
  const t = await getDict(locale);
  // Format a Date's clock time per the restaurant's 12h/24h setting, IN THE
  // RESTAURANT'S TIMEZONE. Without the timeZone option this rendered in the
  // server's clock (UTC on Vercel), so an Italian store texted a time two hours
  // off — the same defect found in the delayed-order EMAIL. Fabrizio
  // cms0gyexp #16.
  //
  // The FORMATTING locale stays "en-US" on purpose even though the words around
  // it are translated: it yields a stable digits-only "19:30" in 24h mode, and
  // 12h mode is itself the English AM/PM convention the restaurant opted into.
  // Rendering the clock in the customer's locale would hand some locales
  // scripted forms ("午後7:30") that read worse in a 160-char text.
  const clock = (d: Date) =>
    d.toLocaleTimeString("en-US", {
      timeZone: timezone || "UTC",
      hour: "numeric",
      minute: "2-digit",
      hour12: hoursFormat !== "24h",
    });
  /** Every text is prefixed with the restaurant name — the customer needs to
   *  know who is texting them before anything else, in any language. */
  const line = (key: string, vars?: Record<string, string | number>) =>
    `${restaurantName}: ${t(key, vars)}`;
  switch (payload.event) {
    case "orderConfirmed": {
      // Auto-accepted → no "accepted" text is ever coming (the order never
      // transitions), so promising one strands the customer. Same fix as the
      // email. Luigi 2026-08-11.
      const body = payload.alreadyAccepted
        ? (() => {
            const eta = payload.estimatedReady ? clock(new Date(payload.estimatedReady)) : null;
            return eta
              ? line("sms.orderConfirmedEta", { orderNumber: payload.orderNumber, time: eta })
              : line("sms.orderConfirmed", { orderNumber: payload.orderNumber });
          })()
        : line("sms.orderReceived", { orderNumber: payload.orderNumber });
      return payload.trackingUrl ? `${body} ${payload.trackingUrl}` : body;
    }
    case "orderStatusUpdate": {
      const s = (payload.status ?? "").toLowerCase();
      if (s === "accepted") {
        const eta = payload.estimatedReady ? clock(new Date(payload.estimatedReady)) : null;
        return eta
          ? line("sms.acceptedEta", { orderNumber: payload.orderNumber, time: eta })
          : line("sms.accepted", { orderNumber: payload.orderNumber });
      }
      if (s === "ready") return line("sms.ready", { orderNumber: payload.orderNumber });
      if (s === "completed") return line("sms.completed", { orderNumber: payload.orderNumber });
      if (s === "rejected" || s === "cancelled" || s === "canceled") {
        // A timed-out order is auto-rejected → tell the customer it was "missed",
        // and never echo the internal "Auto-rejected:" reason. Luigi 2026-06-09.
        const autoMissed = s === "rejected" && (payload.rejectionReason?.startsWith("Auto-rejected") ?? false);
        if (autoMissed) return line("sms.missed", { orderNumber: payload.orderNumber });
        // The reason is staff-typed free text — it can only ride along verbatim,
        // so it gets its own key rather than being glued onto the translated
        // sentence (punctuation and clause order differ per language).
        const rejected = s === "rejected";
        if (payload.rejectionReason) {
          return line(rejected ? "sms.rejectedReason" : "sms.cancelledReason", {
            orderNumber: payload.orderNumber,
            reason: payload.rejectionReason,
          });
        }
        return line(rejected ? "sms.rejected" : "sms.cancelled", { orderNumber: payload.orderNumber });
      }
      return null;
    }
    case "orderDelayed": {
      const eta = payload.newEstimatedReady ? clock(new Date(payload.newEstimatedReady)) : null;
      const body = eta
        ? line("sms.delayedEta", {
            orderNumber: payload.orderNumber,
            minutes: payload.delayMinutes,
            time: eta,
          })
        : line("sms.delayed", { orderNumber: payload.orderNumber, minutes: payload.delayMinutes });
      // Staff-typed reason trails as its own sentence, verbatim.
      return payload.reason ? `${body} ${payload.reason}` : body;
    }
    case "reservationConfirmation": {
      // Respect the status — previously this always said "confirmed", so a
      // declined (and now a missed) booking texted the customer "confirmed".
      // "missed" = auto-declined for not being accepted in time; mirror the
      // kind "couldn't get to it in time" tone of a missed order, and never
      // imply the restaurant actively turned them away. Luigi 2026-06-16.
      // "cancelled" (guest self-cancel) fell through to the confirmed branch
      // and texted "confirmed" to someone who had just cancelled — it now has
      // its own shape, matching what the EMAIL has always done. Luigi 2026-08-11.
      const when = {
        partySize: payload.partySize,
        date: payload.date,
        time: formatTime(payload.time, hoursFormat),
      };
      if (payload.status === "missed") return line("sms.reservationMissed", when);
      if (payload.status === "declined") return line("sms.reservationDeclined", when);
      if (payload.status === "cancelled") return line("sms.reservationCancelled", when);
      if (payload.status === "requested") {
        return line("sms.reservationRequested", { ...when, code: payload.confirmationCode });
      }
      return line("sms.reservationConfirmed", { ...when, code: payload.confirmationCode });
    }
    default:
      return null;
  }
}

/**
 * Resolve the email footer imprint for a restaurant. If the restaurant is
 * under an approved reseller and the reseller has set a `companyName`, that
 * name replaces the default "Fee Free Ordering Systems" in the email footer.
 * (Phase 2-D will introduce a separate `whiteLabel` opt-in toggle; until then,
 * the presence of a companyName is the signal — a reseller who doesn't want
 * their brand on emails just leaves the field blank.)
 */
async function resolveImprint(
  restaurantId: string,
): Promise<{ text: string | null; logoUrl: string | null }> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      resellerProfile: {
        select: {
          status: true,
          companyName: true,
          imprint: true,
          brandLogoUrl: true,
          whiteLabelStatus: true,
          whiteLabelTier: true,
        },
      },
    },
  });
  const p = restaurant?.resellerProfile;
  if (!p || p.status !== "approved") return { text: null, logoUrl: null };

  // De-brand gate (Luigi 2026-06-23): a FREE reseller's imprint + logo flow into emails as soon
  // as they've configured branding (a non-empty imprint OR an uploaded logo) — NO paid subscription
  // required. A partner who set neither leaves emails on the platform default. Mirrors
  // isResellerDebranded() in src/lib/white-label.ts.
  if (!(p.imprint?.trim() || p.brandLogoUrl)) return { text: null, logoUrl: null };

  // Explicit imprint text from /reseller/branding/imprint wins. This is
  // the full one-liner the reseller wrote ("Supported by X | email | phone").
  // Falls back to plain companyName for resellers who haven't filled in
  // the field yet.
  let text: string | null = null;
  if (p.imprint && p.imprint.trim().length > 0) text = p.imprint.trim();
  else if (p.companyName) text = p.companyName;

  return {
    text,
    logoUrl: p.brandLogoUrl ?? null,
  };
}

/** Run a send inside an imprint scope, then always clear it. The setters
 *  are module-scoped global state in email.ts, so the try/finally is
 *  critical — one whitelabel send must not bleed into the next platform
 *  send. Both imprint TEXT and the optional logo URL are scoped together.
 */
async function withImprint<T>(restaurantId: string, fn: () => Promise<T>): Promise<T> {
  const { text, logoUrl } = await resolveImprint(restaurantId);
  setEmailImprint(text);
  setEmailLogoUrl(logoUrl);
  try {
    return await fn();
  } finally {
    setEmailImprint(null);
    setEmailLogoUrl(null);
  }
}

// ─── Event → toggle field mapping ──────────────────────────────────────────

/**
 * Each staff event maps to ONE column on NotificationRecipient. When a new
 * event is added, add it here AND wire it up in `dispatchStaffEvent` below.
 * Keeping this map separate from the dispatcher means the toggle list stays
 * in one place — easy to scan when something looks off.
 */
const STAFF_TOGGLE_FOR_EVENT: Record<StaffEvent, keyof NotificationRecipientToggles> = {
  // Customer placed an order — fires *before* the restaurant accepts it.
  orderPlaced: "orderPlaced",
  // A new customer created an ACCOUNT at this restaurant (Luigi 2026-07-11).
  // Toggle defaults OFF — the owner opts in per recipient.
  customerSignup: "customerSignup",
  // Restaurant accepted an order. The toggle that fires depends on the order
  // type — see `togglesForAcceptance()` for the per-type fan-out.
  orderAcceptedDelivery: "deliveryConfirmed",
  orderAcceptedPickup: "pickupConfirmed",
  orderAcceptedDineIn: "dineInConfirmed",
  orderAcceptedScheduled: "orderAheadConfirmed",
  // Other order lifecycle events.
  orderRejected: "orderRejected",
  orderCanceled: "orderCanceled",
  orderMissed: "orderMissed",
  // ShipDay auto-dispatch rejected the order after acceptance — no driver
  // assigned yet, customer waiting (Luigi 2026-08-03).
  dispatchRejected: "dispatchRejected",
  // Reservations.
  reservationConfirmed: "tableReservationConfirmed",
  // Reports / digests.
  endOfDayReport: "endOfDayReport",
  endOfMonthReport: "endOfMonthReport",
};

export type StaffEvent =
  | "orderPlaced"
  | "customerSignup"
  | "orderAcceptedDelivery"
  | "orderAcceptedPickup"
  | "orderAcceptedDineIn"
  | "orderAcceptedScheduled"
  | "orderRejected"
  | "orderCanceled"
  | "orderMissed"
  | "dispatchRejected"
  | "reservationConfirmed"
  | "endOfDayReport"
  | "endOfMonthReport";

/** Just the boolean toggle columns on NotificationRecipient — extracted so
 *  the event-to-toggle map can be statically typed. */
type NotificationRecipientToggles = {
  deliveryConfirmed: boolean;
  pickupConfirmed: boolean;
  tableReservationConfirmed: boolean;
  tableReservationRequested: boolean;
  orderAheadConfirmed: boolean;
  dineInConfirmed: boolean;
  orderPlaced: boolean;
  customerSignup: boolean;
  orderAccepted: boolean;
  orderRejected: boolean;
  orderCanceled: boolean;
  orderMissed: boolean;
  orderNotPlaced: boolean;
  dispatchRejected: boolean;
  lowBattery: boolean;
  badInternet: boolean;
  endOfDayReport: boolean;
  endOfMonthReport: boolean;
};

// ─── notifyStaff ───────────────────────────────────────────────────────────

export type StaffEventPayload =
  | { event: "orderPlaced" | "orderAcceptedDelivery" | "orderAcceptedPickup" | "orderAcceptedDineIn" | "orderAcceptedScheduled";
      orderNumber: string; customerName: string; total: number; dashboardUrl: string;
      reservation?: { partySize: number; date: string; time: string } | null;
      // Full order detail — passed for orderPlaced so the kitchen "new order" email is
      // ITEMIZED (not the minimal "see breakdown in admin" fallback). Luigi 2026-06-25.
      items?: EmailOrderItem[]; subtotal?: number; taxAmount?: number; deliveryFee?: number;
      /** Fee waived by a free-delivery promo. A waived fee is stored as
       *  deliveryFee = 0 and a $0 row is hidden, so without this the promo left
       *  NO trace on the staff email and delivery looked forgotten (Luigi,
       *  order ORD-742085738). Luigi 2026-07-31. */
      savedDeliveryFee?: number;
      tip?: number; depositTotal?: number; discount?: number;
      /** The individual promos behind `discount`, so the staff email names each
       *  special instead of one lumped figure. Excludes free_delivery, which is
       *  already shown on the delivery row. Luigi 2026-08-11. */
      discountBreakdown?: Array<{ name?: string; amount?: number; couponCode?: string }>;
      serviceFees?: Array<{ name?: string; amount?: number }>;
      orderType?: string; paidOnline?: boolean;
      // Raw payment method ("cash" | "card" | "card_in_person" | "paypal" |
      // "reward_credit") — when the order ISN'T paid online, the staff email
      // chip says WHAT to collect (cash vs card at handoff). Luigi 2026-07-04.
      paymentMethod?: string;
      customerPhone?: string | null; customerEmail?: string | null;
      deliveryAddress?: string | null; customerNotes?: string | null;
      // Store-credit part-payment → "Paid with X" / "To collect" rows so staff
      // never over-collect (Luigi 2026-07-02). Only set when rewards are ON.
      creditApplied?: number; rewardLabel?: string | null;
      /** Projected credit the customer earns — so the STAFF copy of the receipt
       *  matches the customer's, which already showed it. Luigi 2026-08-07. */
      rewardEarned?: number;
      /** Order-timing block: placed / prep / ready + the SCHEDULED banner, so
       *  the kitchen can't mistake a next-day order for an ASAP one. */
      placedAt?: Date | string | null; estimatedReady?: Date | string | null;
      scheduledFor?: Date | string | null; scheduledSlotMinutes?: number | null;
      estimatedMinutes?: number | null;
      /** orderPlaced only — auto-accept made the order `accepted` at CREATE, so
       *  it never transitions and the orderAccepted* email never fires. This
       *  placement ping is then the store's ONLY copy and must say "confirmed",
       *  not "accept it or it gets auto-rejected". Luigi 2026-08-12. */
      alreadyAccepted?: boolean;
      /** orderPlaced only — the REAL auto-reject window for this order, from
       *  auto-reject-window.ts. The email used to say "within your configured
       *  timeout", which named a setting that does not exist. Omitted (e.g. the
       *  kitchen test-order ping) → the old generic sentence. Luigi 2026-08-12. */
      autoRejectMinutes?: number;
      /** orderPlaced only — the order landed while the shop was closed, so its
       *  window starts at OPENING, not at placement. Different sentence. */
      placedWhileClosed?: boolean }
  | { event: "customerSignup"; customerName: string; customerEmail: string; customerPhone?: string | null; dashboardUrl: string }
  | { event: "orderRejected"; orderNumber: string; customerName: string; reason?: string; dashboardUrl: string;
      /** Order money for the staff copy. These two emails carried NO amounts,
       *  so the owner was told an order died without being told what it was
       *  worth or that store credit went back to the customer's wallet.
       *  Formatted at dispatch (that is where the currency lives).
       *  Luigi 2026-08-07. */
      orderTotal?: number; creditApplied?: number; rewardLabel?: string | null }
  | { event: "orderCanceled" | "orderMissed"; orderNumber: string; customerName: string; dashboardUrl: string;
      /** Order money for the staff copy. These two emails carried NO amounts,
       *  so the owner was told an order died without being told what it was
       *  worth or that store credit went back to the customer's wallet.
       *  Formatted at dispatch (that is where the currency lives).
       *  Luigi 2026-08-07. */
      orderTotal?: number; creditApplied?: number; rewardLabel?: string | null }
  | { event: "dispatchRejected"; orderNumber: string; customerName: string; reason?: string; dashboardUrl: string }
  | { event: "reservationConfirmed"; customerName: string; partySize: number; date: string; time: string; confirmationCode: string; status: "confirmed" | "pending" | "cancelled"; dashboardUrl: string;
      // Smart buttons (Fabrizio cmsajnvkm): adults/children split + structured
      // details (child seating / allergies / occasion / accessibility).
      adultsCount?: number | null; childrenCount?: number | null; details?: import("@/lib/reservation-details").ReservationDetails | null;
      // Guest contact + special requests — GloriaFood parity (cms0gyexp #1):
      // the template renders tel:/mailto: links + an amber requests card.
      customerPhone?: string | null; customerEmail?: string | null; notes?: string | null }
  | { event: "endOfDayReport" | "endOfMonthReport"; reportHtml: string; subject: string };

/**
 * Fan out a staff-facing email to every active NotificationRecipient on the
 * restaurant who has the matching toggle enabled. Each recipient receives the
 * email in their own preferred language.
 *
 * Errors per-recipient are caught and logged so one bad address doesn't break
 * the whole fan-out.
 */
export async function notifyStaff(args: {
  restaurantId: string;
  payload: StaffEventPayload;
}): Promise<{ sent: number; skipped: number }> {
  const { restaurantId, payload } = args;

  let toggleField = STAFF_TOGGLE_FOR_EVENT[payload.event];
  // Reservation pings split by status (Fabrizio cms0gyexp follow-up): a NEW
  // booking REQUEST (still pending acceptance) rides its own toggle — the
  // single "tableReservationConfirmed" toggle was mislabeled for it. Confirmed
  // + customer-cancelled updates stay on the confirmed toggle.
  if (payload.event === "reservationConfirmed" && payload.status === "pending") {
    toggleField = "tableReservationRequested" as typeof toggleField;
  }
  if (!toggleField) {
    console.warn(`[notifyStaff] no toggle mapping for event "${payload.event}"`);
    return { sent: 0, skipped: 0 };
  }

  // Load restaurant + active recipients in one query so we can pull the
  // restaurant name (needed by every template) without a second round-trip.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      currency: true,
      hoursFormat: true,
      // REQUIRED by the staff order-timing block. Without it every staff email
      // rendered "Order placed"/"Pickup time" in the SERVER's clock (UTC): a
      // 10:38 PM Toronto order printed as "Saturday, August 8 at 2:38 AM".
      // notifyCustomer already selected this; notifyStaff did not, so only the
      // staff copy was wrong. Luigi 2026-08-08.
      timezone: true,
      notificationRecipients: {
        where: { isActive: true },
      },
    },
  });
  if (!restaurant) return { sent: 0, skipped: 0 };

  const eligible = restaurant.notificationRecipients.filter(
    (r) => (r as unknown as NotificationRecipientToggles)[toggleField] === true
  );
  if (eligible.length === 0) {
    return { sent: 0, skipped: restaurant.notificationRecipients.length };
  }

  let sent = 0;
  // Wrap the whole fan-out in an imprint scope. All recipients on the same
  // restaurant share the same imprint (they're all under the same reseller),
  // so we resolve it once and apply once.
  await withImprint(restaurant.id, async () => {
    await Promise.all(
      eligible.map(async (r) => {
        try {
          await dispatchStaffEvent(r.email, r.emailLanguage, restaurant.name, payload, restaurant.currency, restaurant.hoursFormat === "12h" ? "12h" : "24h", (restaurant as any).timezone || undefined);
          sent++;
        } catch (err) {
          console.error(`[notifyStaff] send to ${r.email} failed:`, err instanceof Error ? err.message : err);
        }
      })
    );
  });
  return { sent, skipped: restaurant.notificationRecipients.length - sent };
}

/**
 * Pre-format the money lines for the STAFF "order rejected / canceled / missed"
 * emails. Store credit is a TENDER, not income, so the owner sees three
 * figures: the order value, what was paid with the store's credit (and is now
 * back in the customer's wallet), and what was actually collected.
 *
 * Returns {} when the order carried no credit context, so a restaurant without
 * a rewards program gets byte-identical emails to before. Luigi 2026-08-07.
 */
function staffOrderMoney(
  payload: { orderTotal?: number; creditApplied?: number; rewardLabel?: string | null },
  currency?: string,
): { orderTotalLabel?: string; creditReturnedLabel?: string; collectedLabel?: string; rewardLabel?: string | null } {
  if (payload.orderTotal == null) return {};
  const cur = currency || "usd";
  const credit = payload.creditApplied ?? 0;
  return {
    orderTotalLabel: formatCurrency(payload.orderTotal, cur),
    ...(credit > 0
      ? {
          creditReturnedLabel: formatCurrency(credit, cur),
          collectedLabel: formatCurrency(
            collectedOf({ total: payload.orderTotal, creditApplied: credit }),
            cur,
          ),
          rewardLabel: payload.rewardLabel ?? null,
        }
      : {}),
  };
}

/** Routes a payload to the matching `send*` function from src/lib/email.ts.
 *  Every staff event must be handled here — if you add a new event to
 *  StaffEvent, TypeScript will force you to handle it. */
async function dispatchStaffEvent(
  to: string,
  locale: string,
  restaurantName: string,
  payload: StaffEventPayload,
  currency?: string,
  hoursFormat?: "12h" | "24h",
  /** Restaurant timezone — the staff order-timing block renders in it. */
  timezone?: string,
): Promise<void> {
  switch (payload.event) {
    case "orderPlaced":
      // The placement ping — "New order received". Kept on its own so the
      // acceptance/confirmation emails below can be distinct + correctly labeled.
      await sendNewOrderNotificationEmail({
        to,
        restaurantName,
        orderNumber: payload.orderNumber,
        customerName: payload.customerName,
        total: payload.total,
        dashboardUrl: payload.dashboardUrl,
        reservation: payload.reservation ?? null,
        items: payload.items,
        subtotal: payload.subtotal,
        taxAmount: payload.taxAmount,
        deliveryFee: payload.deliveryFee,
        savedDeliveryFee: payload.savedDeliveryFee,
        tip: payload.tip,
        depositTotal: payload.depositTotal,
        discount: payload.discount,
        discountBreakdown: payload.discountBreakdown,
        serviceFees: payload.serviceFees,
        orderType: payload.orderType,
        paidOnline: payload.paidOnline,
        paymentMethod: payload.paymentMethod,
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        deliveryAddress: payload.deliveryAddress,
        customerNotes: payload.customerNotes,
        creditApplied: payload.creditApplied,
        rewardLabel: payload.rewardLabel,
        rewardEarned: payload.rewardEarned,
        placedAt: payload.placedAt,
        estimatedReady: payload.estimatedReady,
        scheduledFor: payload.scheduledFor,
        scheduledSlotMinutes: payload.scheduledSlotMinutes,
        estimatedMinutes: payload.estimatedMinutes,
        // Auto-accepted at create → this ping IS the confirmation (the
        // transition-driven acceptance email can never fire for it).
        alreadyAccepted: payload.alreadyAccepted === true,
        autoRejectMinutes: payload.autoRejectMinutes,
        placedWhileClosed: payload.placedWhileClosed === true,
        timezone,
        hoursFormat,
        locale,
        currency,
      });
      return;
    case "orderAcceptedDelivery":
    case "orderAcceptedPickup":
    case "orderAcceptedDineIn":
    case "orderAcceptedScheduled": {
      // Restaurant confirmed an order. Each type gets its OWN labeled email
      // ("Pickup order #X confirmed") so it's distinguishable from the
      // new-order ping and from the other types. The per-type toggle that
      // gated this event already decided we should send it.
      const acceptedType =
        payload.event === "orderAcceptedDelivery" ? "delivery" as const
        : payload.event === "orderAcceptedPickup" ? "pickup" as const
        : payload.event === "orderAcceptedDineIn" ? "dineIn" as const
        : "scheduled" as const;
      await sendOrderAcceptedNotificationEmail({
        to,
        restaurantName,
        orderNumber: payload.orderNumber,
        customerName: payload.customerName,
        total: payload.total,
        dashboardUrl: payload.dashboardUrl,
        acceptedType,
        reservation: payload.reservation ?? null,
        creditApplied: payload.creditApplied,
        rewardLabel: payload.rewardLabel,
        paidOnline: payload.paidOnline,
        paymentMethod: payload.paymentMethod,
        hoursFormat,
        locale,
        currency,
      });
      return;
    }
    case "customerSignup":
      await sendCustomerSignupNotificationEmail({
        to,
        restaurantName,
        customerName: payload.customerName,
        customerEmail: payload.customerEmail,
        customerPhone: payload.customerPhone ?? null,
        dashboardUrl: payload.dashboardUrl,
        locale,
      });
      return;
    case "orderRejected":
      await sendOrderRejectedEmail({
        to,
        restaurantName,
        orderNumber: payload.orderNumber,
        customerName: payload.customerName,
        reason: payload.reason,
        dashboardUrl: payload.dashboardUrl,
        ...staffOrderMoney(payload, currency),
        locale,
      });
      return;
    case "orderCanceled":
    case "orderMissed":
      await sendOrderCanceledEmail({
        to,
        restaurantName,
        orderNumber: payload.orderNumber,
        customerName: payload.customerName,
        dashboardUrl: payload.dashboardUrl,
        ...staffOrderMoney(payload, currency),
        locale,
      });
      return;
    case "dispatchRejected":
      await sendDispatchRejectedEmail({
        to,
        restaurantName,
        orderNumber: payload.orderNumber,
        customerName: payload.customerName,
        reason: payload.reason,
        dashboardUrl: payload.dashboardUrl,
        locale,
      });
      return;
    case "reservationConfirmed":
      await sendNewReservationNotification({
        to,
        restaurantName,
        customerName: payload.customerName,
        partySize: payload.partySize,
        date: payload.date,
        time: payload.time,
        confirmationCode: payload.confirmationCode,
        status: payload.status,
        dashboardUrl: payload.dashboardUrl,
        // Guest contacts + special requests (cms0gyexp #1 — GloriaFood parity)
        customerPhone: payload.customerPhone,
        customerEmail: payload.customerEmail,
        specialRequests: payload.notes,
        // Smart buttons (cmsajnvkm)
        adultsCount: payload.adultsCount ?? null,
        childrenCount: payload.childrenCount ?? null,
        details: payload.details ?? null,
        hoursFormat,
        locale,
      });
      return;
    case "endOfDayReport":
    case "endOfMonthReport":
      // Digest emails do NOT flow through notifyStaff() — they're sent
      // directly by the daily/monthly cron handlers (see
      // /api/cron/daily-digest) using sendDailyDigestEmail /
      // sendMonthlyDigestEmail with the DigestEmail template. The
      // endOfDayReport / endOfMonthReport boolean toggles on
      // NotificationRecipient are read by the CRON (not here) to decide
      // who gets the email. This branch exists only so the exhaustive
      // union check passes.
      return;
  }
}

/**
 * Decide which "order accepted" event to fire based on the order's type.
 * Restaurants can mute, say, dine-in notifications by toggling off
 * `dineInConfirmed` while keeping delivery notifications.
 */
export function staffAcceptEventForOrderType(
  orderType: string,
  isScheduled: boolean
): "orderAcceptedDelivery" | "orderAcceptedPickup" | "orderAcceptedDineIn" | "orderAcceptedScheduled" {
  if (isScheduled) return "orderAcceptedScheduled";
  switch (orderType.toLowerCase()) {
    case "delivery":
      return "orderAcceptedDelivery";
    case "dine_in":
    case "dinein":
    case "dine-in":
      return "orderAcceptedDineIn";
    case "pickup":
    case "take_out":
    case "takeout":
    default:
      return "orderAcceptedPickup";
  }
}

// ─── notifyCustomer ────────────────────────────────────────────────────────

export type CustomerEventPayload =
  | { event: "orderConfirmed"; customerName: string; orderNumber: string; items: { name: string; quantity: number; price: number }[]; total: number; orderType: string; estimatedTime: number; scheduledFor?: Date | string | null; scheduledSlotMinutes?: number | null; placedAt?: Date | string | null; estimatedReady?: Date | string | null; reservation?: { partySize: number; date: string; time: string } | null; trackingUrl: string; appliedPromos?: Array<{ name: string; type: string; discount: number; couponCode?: string }>;
      // Full money breakdown (Luigi 2026-07-02): without these the email's
      // "Subtotal" silently fell back to the TOTAL and tax/tip/discount rows
      // never rendered. creditApplied/rewardLabel only set when rewards are ON.
      subtotal?: number; taxAmount?: number; deliveryFee?: number; tip?: number; depositTotal?: number; discount?: number;
      /** Fee waived by a free-delivery promo. Needed because a waived fee is
       *  stored as deliveryFee = 0 and a $0 row is hidden — so without it the
       *  promo left NO trace on the staff email and delivery looked forgotten
       *  (Luigi, order ORD-742085738). Luigi 2026-07-31. */
      savedDeliveryFee?: number;
      serviceFees?: Array<{ name?: string; amount?: number }>;
      creditApplied?: number; rewardLabel?: string | null; paymentMethod?: string | null; paidStatus?: string | null;
      /** Projected Reward Dollars EARNED on this order (credited at completion) —
       *  green "+ $X" row. Caller only sets it when rewards + earning are ON. */
      rewardEarned?: number;
      /** True when the platform already captured the money (Stripe card, PayPal,
       *  or fully covered by store credit) — drives the green "Paid online" badge.
       *  Was NEVER passed before 2026-07-11, so every customer receipt email
       *  showed the amber "Pay at store" badge, even on card/PayPal orders. */
      paidOnline?: boolean;
      /** Guest self-cancel link (Fabrizio cms0idtz7): page URL to the status
       *  page with the purpose-scoped cancel token. Only set when the cancel
       *  policy offers it (closed_only default → placedWhileClosed orders). */
      cancelUrl?: string;
      /** Order landed while the restaurant was CLOSED — the email adds the
       *  GloriaFood-parity "you'll get an update as soon as they open" note. */
      placedWhileClosed?: boolean;
      /** Order was born ACCEPTED (auto-accept / auto-confirmed pre-order), so no
       *  kitchen-accept email will ever follow — this placement email must BE
       *  the confirmation instead of promising one. Luigi 2026-08-11. */
      alreadyAccepted?: boolean;
      /** The deferred kitchen-alert instant (Order.alertAt) = the restaurant's
       *  next opening. When set with placedWhileClosed, the closed note names
       *  the concrete time — "Check your email on Saturday, 25 Jul, 20:15"
       *  (GloriaFood parity, Fabrizio cms0gyexp #8). */
      opensAt?: Date | string | null }
  | { event: "orderStatusUpdate"; customerName: string; orderNumber: string; status: string; estimatedReady?: Date; rejectionReason?: string;
      /** Preset reason CODE (kitchen.rejectReasons.*) so the email can render
       *  it in the CUSTOMER's language instead of mailing the staff-language
       *  string verbatim (Fabrizio cms0gyexp #10). Optional: free-typed
       *  reasons and older callers simply omit it. */
      rejectionReasonKey?: string | null; trackingUrl?: string; paidOnline?: boolean; paymentMethod?: string;
      /** Store credit the reject/cancel path returned to the wallet — caller
       *  gates on rewardsEnabled; the email adds the "returned to your wallet"
       *  card so a bucks-paid customer never reads "nothing to refund". */
      creditApplied?: number; rewardLabel?: string | null;
      /** Order total — lets the POSITIVE-status email ("accepted" is the real
       *  confirmation) show Total / paid-with-credit / balance. Only used when
       *  creditApplied > 0, so a non-rewards restaurant's email is unchanged.
       *  Luigi 2026-08-07. */
      orderTotal?: number;
      /** True when nothing is left to pay (fully prepaid or fully credit). */
      balanceSettled?: boolean;
      /** WHO cancelled (for status "cancelled"): "customer" flips the email
       *  copy to the you-cancelled variant instead of "the restaurant
       *  cancelled your order". */
      cancelledBy?: string }
  /** Kitchen pushed back the ready time. Fired from POST /api/orders/[id]/delay
   *  whenever staff hits "+5 / +10 / Custom" on the order detail. Customer
   *  always gets this (no toggle gate) because a delay is the kind of news
   *  a paying customer should hear about regardless of restaurant settings. */
  | { event: "orderDelayed"; customerName: string; orderNumber: string; newEstimatedReady: Date; delayMinutes: number; reason: string | null }
  | { event: "reservationConfirmation"; customerName: string; partySize: number; date: string; time: string; confirmationCode: string; status: "requested" | "confirmed" | "declined" | "missed" | "cancelled"; depositPaid?: boolean; depositAmount?: number; preOrderTotal?: number;
      // Smart buttons (Fabrizio cmsajnvkm) + the guest's own notes, so the
      // confirmation email finally echoes what they asked for.
      adultsCount?: number | null; childrenCount?: number | null; details?: import("@/lib/reservation-details").ReservationDetails | null; notes?: string | null;
      /** Reservation id — REQUIRED to build the guest cancel link (Fabrizio
       *  cms0idtz7). Optional for back-compat with older call sites. */
      reservationId?: string;
      /** Booked while the restaurant was CLOSED (Reservation.alertAt set) —
       *  the "requested" email adds the closed-hours note, naming the next
       *  opening when opensAt resolves (orders got this in cms0gyexp #8). */
      bookedWhileClosed?: boolean;
      opensAt?: Date | string | null };

/**
 * Send a customer-facing email gated by the matching `Restaurant.customerEmail*`
 * toggle. If the customer has no email or the toggle is off, the send is
 * skipped silently.
 *
 * The `event → toggle` map for customer-side toggles:
 *
 *   orderConfirmed       → Restaurant.customerEmailOrderConfirm
 *   orderStatusUpdate    → status-specific:
 *     "ready"/"preparing" + pickup → customerEmailPickupReady
 *     "ready"/"preparing" + delivery → customerEmailDeliveryReady
 *     "ready"/"preparing" + dineIn  → customerEmailDineInReady
 *     "rejected"                     → customerEmailOrderRejected
 *     other statuses                 → always send (cancellation, etc.)
 *   reservationConfirmation → always send (customer actively booked, expects email)
 */
export async function notifyCustomer(args: {
  restaurantId: string;
  customerEmail: string | null | undefined;
  /** Optional E.164-ish phone. When provided AND Twilio env vars are
   *  set on the platform, an SMS goes out alongside the email for
   *  status events the customer would expect a text on (order
   *  confirmed, accepted, ready, rejected). Falls back silently when
   *  Twilio isn't configured — same as the email-only path. */
  customerPhone?: string | null;
  /** Optional Customer.id — when provided AND the restaurant has the
   *  branded_mobile_app add-on (app_store_listing), an order-status PUSH
   *  goes to the customer's registered app devices alongside the email,
   *  gated by their push preference. Same silent-fallback philosophy as
   *  SMS. Luigi 2026-08-02. */
  customerId?: string | null;
  customerLocale?: string;
  orderType?: string;
  payload: CustomerEventPayload;
}): Promise<{ sent: boolean; reason?: string; smsSent?: boolean }> {
  const { restaurantId, customerEmail, customerPhone, customerLocale, orderType, payload } = args;
  if (!customerEmail) return { sent: false, reason: "no customer email" };

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      slug: true,
      // Domain fields — let restaurantOrderUrl() build customer-facing
      // links on the most-branded host (verified custom domain >
      // platform subdomain > apex) so status/delay email links stay on
      // the restaurant's own domain.
      subdomain: true,
      customDomain: true,
      customDomainStatus: true,
      // Phone + email surfaced as contact info in the status / delay
      // email footers so customers can call/email the restaurant
      // directly from any update message (GloriaFood parity).
      phone: true,
      email: true,
      defaultLanguage: true,
      currency: true,
      // Formats the "Estimated ready" time in the restaurant's local zone.
      timezone: true,
      // 12h/24h preference — formats reservation/scheduled times in emails.
      hoursFormat: true,
      // Receipt-header logo — rendered at the top of the email receipt.
      receiptLogoUrl: true,
      // Per-toggle email switches — let owners mute individual status
      // notifications without affecting the others.
      customerEmailOrderConfirm: true,
      customerEmailPickupReady: true,
      customerEmailDeliveryReady: true,
      customerEmailDineInReady: true,
      customerEmailOrderRejected: true,
      // Kitchen workflow mode — drives whether the intermediate
      // status-update emails (preparing / ready) actually fire.
      // In "simple" mode the kitchen never transitions through those
      // states by user action, and even if a status accidentally
      // moved through them (admin override / API), the customer
      // shouldn't get "your order is being made" mid-stream emails
      // because the workflow we're selling them is "you'll hear back
      // once it's confirmed." See src/app/order/[slug]/status/[orderId]
      // — the customer-side status page already collapses
      // preparing/ready onto "accepted" in simple mode; emails now
      // do the same.
      kitchenWorkflowMode: true,
    },
  });
  if (!restaurant) return { sent: false, reason: "restaurant not found" };

  const locale = customerLocale || restaurant.defaultLanguage || "en";

  // SMS helper closure — fire-and-forget. Twilio call sites that fail
  // shouldn't break the email path, so we swallow errors and log them.
  // Returns the actual sent flag so callers (mostly internal logging)
  // can tell. No-op when customerPhone is unset OR when the
  // restaurant doesn't have the `customer_sms` add-on (Luigi 2026-05-30
  // — SMS Notifications is a paid add-on at $19.99/mo, separately
  // billed; restaurants without the add-on get email-only).
  let smsDispatched = false;

  // The short body is shared by SMS and branded-app push, so build it AT MOST
  // ONCE per notifyCustomer — and only after an entitlement check has passed,
  // so a restaurant on neither add-on never pays for the dictionary load on the
  // order-placement hot path. (getDict caches per locale process-wide, so the
  // load is a Map hit after the first send anyway.)
  let shortBodyCache: string | null | undefined;
  const shortBody = async (): Promise<string | null> => {
    if (shortBodyCache === undefined) {
      shortBodyCache = await buildCustomerSms(
        restaurant.name,
        payload,
        restaurant.hoursFormat === "12h" ? "12h" : "24h",
        (restaurant as any).timezone || undefined,
        // The customer's language — it was resolved a few lines above all
        // along, and simply never passed in. That is what left every text
        // English-only until 2026-08-11.
        locale,
      );
    }
    return shortBodyCache;
  };

  const fireSms = async () => {
    if (!customerPhone) return;
    const entitled = await hasFeature(restaurantId, "customer_sms");
    if (!entitled) return;
    const body = await shortBody();
    if (!body) return;
    try {
      const r = await sendSms({ to: customerPhone, body });
      smsDispatched = r.sent;
      if (!r.sent && r.reason && !r.reason.startsWith("Twilio not configured")) {
        console.warn(`[notifyCustomer sms] not sent: ${r.reason}`);
      }
    } catch (e) {
      console.error("[notifyCustomer sms] threw:", e);
    }
  };

  // Branded-app push closure — the customer sibling of fireSms, riding the
  // SAME short-message builder so push/SMS wording never diverges. Since
  // 2026-08-11 that builder really is localized (it was English-only before,
  // despite this comment), so the push lands in the customer's language too.
  // Gates: branded_mobile_app entitlement + the customer's orderUpdates pref.
  // Fire-and-forget: a push failure must never affect the email result.
  // Luigi 2026-08-02.
  const firePush = async () => {
    if (!args.customerId) return;
    try {
      if (!(await hasFeature(restaurantId, "app_store_listing"))) return;
      if (!(await customerWantsOrderPush(args.customerId))) return;
      const body = await shortBody();
      if (!body) return;
      const data: Record<string, string> = {};
      if ("trackingUrl" in payload && typeof payload.trackingUrl === "string" && payload.trackingUrl) {
        data.url = payload.trackingUrl;
      }
      await sendCustomerPush(restaurantId, args.customerId, {
        title: restaurant.name,
        body,
        data,
      });
    } catch (e) {
      console.error("[notifyCustomer push] threw:", e);
    }
  };

  switch (payload.event) {
    case "orderConfirmed": {
      if (!restaurant.customerEmailOrderConfirm) return { sent: false, reason: "toggle off" };
      await withImprint(restaurantId, async () => {
        await sendOrderConfirmationEmail({
          to: customerEmail,
          customerName: payload.customerName,
          orderNumber: payload.orderNumber,
          restaurantName: restaurant.name,
          items: payload.items,
          total: payload.total,
          subtotal: payload.subtotal,
          taxAmount: payload.taxAmount,
          deliveryFee: payload.deliveryFee,
          savedDeliveryFee: payload.savedDeliveryFee,
          tip: payload.tip,
          depositTotal: payload.depositTotal,
          discount: payload.discount,
          serviceFees: payload.serviceFees,
          orderType: payload.orderType,
          estimatedTime: payload.estimatedTime,
          scheduledFor: payload.scheduledFor ?? null,
          placedAt: payload.placedAt ?? null,
          estimatedReady: payload.estimatedReady ?? null,
          // Range-mode window width — email shows "start – end". Fabrizio cmqqxerxs.
          scheduledSlotMinutes: payload.scheduledSlotMinutes ?? null,
          reservation: payload.reservation ?? null,
          timezone: (restaurant as any).timezone || undefined,
          hoursFormat: restaurant.hoursFormat === "12h" ? "12h" : "24h",
          trackingUrl: payload.trackingUrl,
          locale,
          appliedPromos: payload.appliedPromos,
          currency: restaurant.currency,
          logoUrl: (restaurant as any).receiptLogoUrl ?? undefined,
          creditApplied: payload.creditApplied,
          rewardLabel: payload.rewardLabel,
          rewardEarned: payload.rewardEarned,
          paymentMethod: payload.paymentMethod,
          paidStatus: payload.paidStatus,
          paidOnline: payload.paidOnline,
          cancelUrl: payload.cancelUrl,
          placedWhileClosed: payload.placedWhileClosed,
          alreadyAccepted: payload.alreadyAccepted,
          opensAt: payload.opensAt ?? null,
          // Restaurant contacts for the footer (cms0gyexp #4) — the receipt
          // email promised "details below" but never passed them; this also
          // revives the Reply-To → restaurant routing in the sender.
          restaurantUrl: restaurantOrderUrl(restaurant as any, ""),
          restaurantEmail: (restaurant as any).email ?? undefined,
          restaurantPhone: (restaurant as any).phone ?? undefined,
        });
      });
      await fireSms();
      await firePush();
      return { sent: true, smsSent: smsDispatched };
    }
    case "orderStatusUpdate": {
      // Match the right toggle based on status + order type.
      const status = payload.status.toLowerCase();
      const type = (orderType ?? "").toLowerCase();
      const isReadyish = status === "ready" || status === "preparing" || status === "completed";
      const isRejectedish = status === "rejected" || status === "cancelled" || status === "canceled";

      // Kitchen workflow mode gate — simple-mode restaurants don't
      // surface intermediate "preparing" or "ready" transitions to
      // their customers. The kitchen accept email already went out
      // ("Order confirmed — kitchen is starting on it"); a follow-up
      // "your order is being made" mid-stream would be redundant +
      // confusing. completed/rejected/cancelled emails still fire
      // because those are terminal states the customer DOES need to
      // know about regardless of mode.
      const mode = restaurant.kitchenWorkflowMode ?? "simple";
      if (mode === "simple" && (status === "preparing" || status === "ready")) {
        return { sent: false, reason: "simple workflow mode skips intermediate updates" };
      }

      let toggle = true;
      if (isReadyish) {
        if (type === "delivery") toggle = restaurant.customerEmailDeliveryReady;
        else if (type === "dine_in" || type === "dinein" || type === "dine-in")
          toggle = restaurant.customerEmailDineInReady;
        else toggle = restaurant.customerEmailPickupReady;
      } else if (isRejectedish) {
        toggle = restaurant.customerEmailOrderRejected;
      }
      if (!toggle) return { sent: false, reason: "toggle off" };
      await withImprint(restaurantId, async () => {
        await sendOrderStatusUpdateEmail({
          to: customerEmail,
          customerName: payload.customerName,
          orderNumber: payload.orderNumber,
          status: payload.status,
          restaurantName: restaurant.name,
          // Service-aware estimated-time line + delay notice on the accepted
          // email keys off this. Fabrizio cms0gyexp #15.
          orderType,
          estimatedReady: payload.estimatedReady,
          rejectionReason: payload.rejectionReason,
          rejectionReasonKey: payload.rejectionReasonKey,
          // Real status-page URL — fixes broken "View order status"
          // button on the accepted/ready/etc. emails (Luigi 2026-05-31).
          // Fallback derived from restaurant slug when caller omitted.
          trackingUrl: payload.trackingUrl,
          paidOnline: payload.paidOnline,
          paymentMethod: payload.paymentMethod,
          // Wallet-returned store credit — formatted here (this is where the
          // restaurant's currency lives); template shows it on negative
          // statuses only. Caller already gated on rewardsEnabled.
          creditReturned:
            (payload.creditApplied ?? 0) > 0
              ? formatCurrency(payload.creditApplied!, restaurant.currency)
              : undefined,
          rewardLabel: payload.rewardLabel,
          // POSITIVE-status money summary. Formatted here (this is where the
          // restaurant's currency lives) and only when store credit was really
          // used — the template renders nothing without creditUsed.
          ...((payload.creditApplied ?? 0) > 0 && payload.orderTotal != null
            ? {
                creditUsed: formatCurrency(payload.creditApplied!, restaurant.currency),
                orderTotalLabel: formatCurrency(payload.orderTotal, restaurant.currency),
                amountDueLabel: formatCurrency(
                  collectedOf({ total: payload.orderTotal, creditApplied: payload.creditApplied }),
                  restaurant.currency,
                ),
                balanceSettled: payload.balanceSettled === true,
              }
            : {}),
          cancelledBy: payload.cancelledBy,
          restaurantPhone: restaurant.phone,
          restaurantEmail: restaurant.email,
          restaurantUrl: restaurantOrderUrl(restaurant, ""),
          locale,
          timezone: (restaurant as any).timezone || undefined,
          hoursFormat: restaurant.hoursFormat === "12h" ? "12h" : "24h",
        });
      });
      await fireSms();
      await firePush();
      return { sent: true, smsSent: smsDispatched };
    }
    case "orderDelayed": {
      // No toggle gate — when the kitchen pushes the ready time, the
      // customer always hears about it. They paid; they deserve the
      // update. Imprint set so reseller-branded restaurants stay on
      // their own letterhead.
      await withImprint(restaurantId, async () => {
        await sendOrderDelayedEmail({
          to: customerEmail,
          customerName: payload.customerName,
          orderNumber: payload.orderNumber,
          restaurantName: restaurant.name,
          newEstimatedReady: payload.newEstimatedReady,
          delayMinutes: payload.delayMinutes,
          reason: payload.reason,
          // Service-specific new-ETA wording (pickup vs delivery). cms0gyexp #15.
          orderType,
          // The new-ETA clock MUST render in the restaurant's timezone. Without
          // these two the template fell back to the server's UTC and mailed a
          // time hours off the real one. Fabrizio cms0gyexp #16.
          timezone: (restaurant as any).timezone || undefined,
          hoursFormat: restaurant.hoursFormat === "12h" ? "12h" : "24h",
          restaurantPhone: restaurant.phone,
          restaurantEmail: restaurant.email,
          restaurantUrl: restaurantOrderUrl(restaurant, ""),
          locale,
        });
      });
      await fireSms();
      await firePush();
      return { sent: true, smsSent: smsDispatched };
    }
    case "reservationConfirmation": {
      // Reservations always send — customer expects this after booking.
      // Guest self-cancel link (Fabrizio cms0idtz7): only on the live
      // statuses (requested/confirmed) and only when the caller threaded the
      // reservation id. PAGE link — branded-host safe via restaurantOrderUrl.
      const cancelUrl =
        payload.reservationId && (payload.status === "requested" || payload.status === "confirmed")
          ? restaurantOrderUrl(
              restaurant,
              `/reservation/${payload.reservationId}/cancel?t=${signActionToken("reservation-cancel", payload.reservationId)}`,
            )
          : undefined;
      await withImprint(restaurantId, async () => {
        await sendReservationConfirmation({
          to: customerEmail,
          customerName: payload.customerName,
          restaurantName: restaurant.name,
          partySize: payload.partySize,
          date: payload.date,
          time: payload.time,
          confirmationCode: payload.confirmationCode,
          status: payload.status,
          depositPaid: payload.depositPaid,
          depositAmount: payload.depositAmount,
          preOrderTotal: payload.preOrderTotal,
          // Smart buttons (cmsajnvkm) + the guest's notes echoed back — wires
          // the template's specialRequests card live for the first time.
          specialRequests: payload.notes ?? null,
          adultsCount: payload.adultsCount ?? null,
          childrenCount: payload.childrenCount ?? null,
          details: payload.details ?? null,
          cancelUrl,
          hoursFormat: restaurant.hoursFormat === "12h" ? "12h" : "24h",
          // Closed-hours note with the concrete opening time (polish batch —
          // orders got this in cms0gyexp #8). Only the initial booking POST
          // threads these; the later confirm/decline/missed/cancel resends
          // fire from admin/cron contexts and correctly omit them.
          bookedWhileClosed: payload.bookedWhileClosed,
          opensAt: payload.opensAt ?? null,
          timezone: restaurant.timezone ?? undefined,
          // Restaurant contacts (cms0gyexp #4): the closing line says "contact
          // us using the details below" — these make the footer actually
          // carry them (clickable tel:/mailto:), plus Reply-To routing.
          restaurantUrl: restaurantOrderUrl(restaurant as any, ""),
          restaurantEmail: (restaurant as any).email ?? undefined,
          restaurantPhone: (restaurant as any).phone ?? undefined,
          locale,
        });
      });
      await fireSms();
      await firePush();
      return { sent: true, smsSent: smsDispatched };
    }
  }
}
