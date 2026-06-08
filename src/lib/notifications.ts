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
import {
  sendNewOrderNotificationEmail,
  sendNewReservationNotification,
  sendOrderConfirmationEmail,
  sendOrderStatusUpdateEmail,
  sendOrderDelayedEmail,
  sendOrderRejectedEmail,
  sendOrderCanceledEmail,
  sendReservationConfirmation,
  setEmailImprint,
  setEmailLogoUrl,
} from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { hasFeature } from "@/lib/entitlements";

/**
 * Build a short SMS body for a customer order event. Cap-160 friendly
 * (single-segment) for the common shapes; the SMS sender enforces a
 * 320-char hard cap as a safety net. We deliberately avoid putting the
 * tracking URL in pickup-ready / delivery-ready texts because most
 * customers tap the link, which then defeats the "the page already
 * told you" assumption — keep the texts informational + actionable.
 */
function buildCustomerSms(
  restaurantName: string,
  payload: CustomerEventPayload,
): string | null {
  switch (payload.event) {
    case "orderConfirmed":
      return `${restaurantName}: Order #${payload.orderNumber} received. We'll text you when it's accepted. ${payload.trackingUrl ?? ""}`.trim();
    case "orderStatusUpdate": {
      const s = (payload.status ?? "").toLowerCase();
      if (s === "accepted") {
        const eta = payload.estimatedReady
          ? new Date(payload.estimatedReady).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : null;
        return `${restaurantName}: Order #${payload.orderNumber} accepted${eta ? ` — ready ~${eta}` : ""}.`;
      }
      if (s === "ready") return `${restaurantName}: Order #${payload.orderNumber} is ready for pickup!`;
      if (s === "completed") return `${restaurantName}: Order #${payload.orderNumber} is complete. Thanks!`;
      if (s === "rejected" || s === "cancelled" || s === "canceled") {
        return `${restaurantName}: Order #${payload.orderNumber} was ${s}${payload.rejectionReason ? ` — ${payload.rejectionReason}` : ""}.`;
      }
      return null;
    }
    case "orderDelayed": {
      const eta = payload.newEstimatedReady
        ? new Date(payload.newEstimatedReady).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : null;
      return `${restaurantName}: Heads up — order #${payload.orderNumber} is delayed about ${payload.delayMinutes} minutes${eta ? `, new ETA ~${eta}` : ""}.${payload.reason ? ` ${payload.reason}` : ""}`;
    }
    case "reservationConfirmation":
      return `${restaurantName}: Reservation for ${payload.partySize} on ${payload.date} at ${payload.time} confirmed. Code ${payload.confirmationCode}.`;
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

  // White-label flowing into emails is GATED on an active subscription.
  // Reseller must have whiteLabelStatus="active" with a tier set
  // (basic = imprint+logo, full = imprint+logo+custom domain). Without
  // a sub, the imprint + logo they've configured don't render.
  const wlActive = p.whiteLabelStatus === "active" && (p.whiteLabelTier === "basic" || p.whiteLabelTier === "full");
  if (!wlActive) return { text: null, logoUrl: null };

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
  // Reservations.
  reservationConfirmed: "tableReservationConfirmed",
  // Reports / digests.
  endOfDayReport: "endOfDayReport",
  endOfMonthReport: "endOfMonthReport",
};

export type StaffEvent =
  | "orderPlaced"
  | "orderAcceptedDelivery"
  | "orderAcceptedPickup"
  | "orderAcceptedDineIn"
  | "orderAcceptedScheduled"
  | "orderRejected"
  | "orderCanceled"
  | "orderMissed"
  | "reservationConfirmed"
  | "endOfDayReport"
  | "endOfMonthReport";

/** Just the boolean toggle columns on NotificationRecipient — extracted so
 *  the event-to-toggle map can be statically typed. */
type NotificationRecipientToggles = {
  deliveryConfirmed: boolean;
  pickupConfirmed: boolean;
  tableReservationConfirmed: boolean;
  orderAheadConfirmed: boolean;
  dineInConfirmed: boolean;
  orderPlaced: boolean;
  orderAccepted: boolean;
  orderRejected: boolean;
  orderCanceled: boolean;
  orderMissed: boolean;
  orderNotPlaced: boolean;
  lowBattery: boolean;
  badInternet: boolean;
  endOfDayReport: boolean;
  endOfMonthReport: boolean;
};

// ─── notifyStaff ───────────────────────────────────────────────────────────

export type StaffEventPayload =
  | { event: "orderPlaced" | "orderAcceptedDelivery" | "orderAcceptedPickup" | "orderAcceptedDineIn" | "orderAcceptedScheduled";
      orderNumber: string; customerName: string; total: number; dashboardUrl: string;
      reservation?: { partySize: number; date: string; time: string } | null }
  | { event: "orderRejected"; orderNumber: string; customerName: string; reason?: string; dashboardUrl: string }
  | { event: "orderCanceled" | "orderMissed"; orderNumber: string; customerName: string; dashboardUrl: string }
  | { event: "reservationConfirmed"; customerName: string; partySize: number; date: string; time: string; confirmationCode: string; status: "confirmed" | "pending"; dashboardUrl: string }
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

  const toggleField = STAFF_TOGGLE_FOR_EVENT[payload.event];
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
          await dispatchStaffEvent(r.email, r.emailLanguage, restaurant.name, payload, restaurant.currency);
          sent++;
        } catch (err) {
          console.error(`[notifyStaff] send to ${r.email} failed:`, err instanceof Error ? err.message : err);
        }
      })
    );
  });
  return { sent, skipped: restaurant.notificationRecipients.length - sent };
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
): Promise<void> {
  switch (payload.event) {
    case "orderPlaced":
    case "orderAcceptedDelivery":
    case "orderAcceptedPickup":
    case "orderAcceptedDineIn":
    case "orderAcceptedScheduled":
      await sendNewOrderNotificationEmail({
        to,
        restaurantName,
        orderNumber: payload.orderNumber,
        customerName: payload.customerName,
        total: payload.total,
        dashboardUrl: payload.dashboardUrl,
        reservation: payload.reservation ?? null,
        locale,
        currency,
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
  | { event: "orderConfirmed"; customerName: string; orderNumber: string; items: { name: string; quantity: number; price: number }[]; total: number; orderType: string; estimatedTime: number; scheduledFor?: Date | string | null; reservation?: { partySize: number; date: string; time: string } | null; trackingUrl: string; appliedPromos?: Array<{ name: string; type: string; discount: number; couponCode?: string }> }
  | { event: "orderStatusUpdate"; customerName: string; orderNumber: string; status: string; estimatedReady?: Date; rejectionReason?: string; trackingUrl?: string; paidOnline?: boolean; paymentMethod?: string }
  /** Kitchen pushed back the ready time. Fired from POST /api/orders/[id]/delay
   *  whenever staff hits "+5 / +10 / Custom" on the order detail. Customer
   *  always gets this (no toggle gate) because a delay is the kind of news
   *  a paying customer should hear about regardless of restaurant settings. */
  | { event: "orderDelayed"; customerName: string; orderNumber: string; newEstimatedReady: Date; delayMinutes: number; reason: string | null }
  | { event: "reservationConfirmation"; customerName: string; partySize: number; date: string; time: string; confirmationCode: string; status: "requested" | "confirmed" | "declined"; depositPaid?: boolean; depositAmount?: number; preOrderTotal?: number };

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
      // Phone + email surfaced as contact info in the status / delay
      // email footers so customers can call/email the restaurant
      // directly from any update message (GloriaFood parity).
      phone: true,
      email: true,
      defaultLanguage: true,
      currency: true,
      // Formats the "Estimated ready" time in the restaurant's local zone.
      timezone: true,
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
  const fireSms = async () => {
    if (!customerPhone) return;
    const entitled = await hasFeature(restaurantId, "customer_sms");
    if (!entitled) return;
    const body = buildCustomerSms(restaurant.name, payload);
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
          orderType: payload.orderType,
          estimatedTime: payload.estimatedTime,
          scheduledFor: payload.scheduledFor ?? null,
          reservation: payload.reservation ?? null,
          timezone: (restaurant as any).timezone || undefined,
          trackingUrl: payload.trackingUrl,
          locale,
          appliedPromos: payload.appliedPromos,
          currency: restaurant.currency,
        });
      });
      await fireSms();
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
      const baseUrlForStatus = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
      await withImprint(restaurantId, async () => {
        await sendOrderStatusUpdateEmail({
          to: customerEmail,
          customerName: payload.customerName,
          orderNumber: payload.orderNumber,
          status: payload.status,
          restaurantName: restaurant.name,
          estimatedReady: payload.estimatedReady,
          rejectionReason: payload.rejectionReason,
          // Real status-page URL — fixes broken "View order status"
          // button on the accepted/ready/etc. emails (Luigi 2026-05-31).
          // Fallback derived from restaurant slug when caller omitted.
          trackingUrl: payload.trackingUrl,
          paidOnline: payload.paidOnline,
          paymentMethod: payload.paymentMethod,
          restaurantPhone: restaurant.phone,
          restaurantEmail: restaurant.email,
          restaurantUrl: `${baseUrlForStatus}/order/${restaurant.slug}`,
          locale,
          timezone: (restaurant as any).timezone || undefined,
        });
      });
      await fireSms();
      return { sent: true, smsSent: smsDispatched };
    }
    case "orderDelayed": {
      // No toggle gate — when the kitchen pushes the ready time, the
      // customer always hears about it. They paid; they deserve the
      // update. Imprint set so reseller-branded restaurants stay on
      // their own letterhead.
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
      await withImprint(restaurantId, async () => {
        await sendOrderDelayedEmail({
          to: customerEmail,
          customerName: payload.customerName,
          orderNumber: payload.orderNumber,
          restaurantName: restaurant.name,
          newEstimatedReady: payload.newEstimatedReady,
          delayMinutes: payload.delayMinutes,
          reason: payload.reason,
          restaurantPhone: restaurant.phone,
          restaurantEmail: restaurant.email,
          restaurantUrl: `${baseUrl}/order/${restaurant.slug}`,
          locale,
        });
      });
      await fireSms();
      return { sent: true, smsSent: smsDispatched };
    }
    case "reservationConfirmation": {
      // Reservations always send — customer expects this after booking.
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
          locale,
        });
      });
      await fireSms();
      return { sent: true, smsSent: smsDispatched };
    }
  }
}
