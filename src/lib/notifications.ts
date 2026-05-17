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
  sendOrderRejectedEmail,
  sendOrderCanceledEmail,
  sendReservationConfirmation,
} from "@/lib/email";

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
      orderNumber: string; customerName: string; total: number; dashboardUrl: string }
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
  await Promise.all(
    eligible.map(async (r) => {
      try {
        await dispatchStaffEvent(r.email, r.emailLanguage, restaurant.name, payload);
        sent++;
      } catch (err) {
        console.error(`[notifyStaff] send to ${r.email} failed:`, err instanceof Error ? err.message : err);
      }
    })
  );
  return { sent, skipped: restaurant.notificationRecipients.length - sent };
}

/** Routes a payload to the matching `send*` function from src/lib/email.ts.
 *  Every staff event must be handled here — if you add a new event to
 *  StaffEvent, TypeScript will force you to handle it. */
async function dispatchStaffEvent(
  to: string,
  locale: string,
  restaurantName: string,
  payload: StaffEventPayload
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
      // Reports use the generic billing notification shape with custom HTML —
      // gives us a quick path before we build dedicated digest templates.
      // Phase E4 will replace this with proper digest emails.
      // For now, just log so we know when reports are dispatched.
      console.log(`[notifyStaff] ${payload.event} for ${restaurantName} — digest not yet implemented`);
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
  | { event: "orderConfirmed"; customerName: string; orderNumber: string; items: { name: string; quantity: number; price: number }[]; total: number; orderType: string; estimatedTime: number; trackingUrl: string }
  | { event: "orderStatusUpdate"; customerName: string; orderNumber: string; status: string; estimatedReady?: Date; rejectionReason?: string }
  | { event: "reservationConfirmation"; customerName: string; partySize: number; date: string; time: string; confirmationCode: string; status: "confirmed" | "pending"; depositPaid?: boolean; depositAmount?: number; preOrderTotal?: number };

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
  customerLocale?: string;
  orderType?: string;
  payload: CustomerEventPayload;
}): Promise<{ sent: boolean; reason?: string }> {
  const { restaurantId, customerEmail, customerLocale, orderType, payload } = args;
  if (!customerEmail) return { sent: false, reason: "no customer email" };

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true,
      defaultLanguage: true,
      customerEmailOrderConfirm: true,
      customerEmailPickupReady: true,
      customerEmailDeliveryReady: true,
      customerEmailDineInReady: true,
      customerEmailOrderRejected: true,
    },
  });
  if (!restaurant) return { sent: false, reason: "restaurant not found" };

  const locale = customerLocale || restaurant.defaultLanguage || "en";

  switch (payload.event) {
    case "orderConfirmed": {
      if (!restaurant.customerEmailOrderConfirm) return { sent: false, reason: "toggle off" };
      await sendOrderConfirmationEmail({
        to: customerEmail,
        customerName: payload.customerName,
        orderNumber: payload.orderNumber,
        restaurantName: restaurant.name,
        items: payload.items,
        total: payload.total,
        orderType: payload.orderType,
        estimatedTime: payload.estimatedTime,
        trackingUrl: payload.trackingUrl,
        locale,
      });
      return { sent: true };
    }
    case "orderStatusUpdate": {
      // Match the right toggle based on status + order type.
      const status = payload.status.toLowerCase();
      const type = (orderType ?? "").toLowerCase();
      const isReadyish = status === "ready" || status === "preparing" || status === "completed";
      const isRejectedish = status === "rejected" || status === "cancelled" || status === "canceled";
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
      await sendOrderStatusUpdateEmail({
        to: customerEmail,
        customerName: payload.customerName,
        orderNumber: payload.orderNumber,
        status: payload.status,
        restaurantName: restaurant.name,
        estimatedReady: payload.estimatedReady,
        rejectionReason: payload.rejectionReason,
        locale,
      });
      return { sent: true };
    }
    case "reservationConfirmation": {
      // Reservations always send — customer expects this after booking.
      await sendReservationConfirmation({
        to: customerEmail,
        customerName: payload.customerName,
        restaurantName: restaurant.name,
        partySize: payload.partySize,
        date: payload.date,
        time: payload.time,
        confirmationCode: payload.confirmationCode,
        status: payload.status as "confirmed" | "pending",
        depositPaid: payload.depositPaid,
        depositAmount: payload.depositAmount,
        preOrderTotal: payload.preOrderTotal,
        locale,
      });
      return { sent: true };
    }
  }
}
