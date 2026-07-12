/**
 * ShipDay POST /orders payload builder — PURE (no prisma import) so the
 * contract is locked by unit tests (shipday-payload.test.ts) instead of being
 * re-discovered one silent rejection at a time. 2026-07-12: a full-ISO
 * expectedPickupTime and bare 10-digit phones both made ShipDay reject with
 * HTTP 200 + success:false, invisible until the dispatch-honesty fix.
 *
 * Contract (docs.shipday.com/reference/insert-delivery-order):
 *  - expectedPickupTime / expectedDeliveryTime: TIME-ONLY "hh:mm:ss" (UTC);
 *    expectedDeliveryDate: "yyyy-mm-dd". Delivery ETA = pickup + 25 min.
 *  - Phones: E.164 with country code (sanitizePhone; raw fallback so
 *    ShipDay's surfaced error names the field rather than us dropping a
 *    required one).
 *  - Money fields rounded to 2dp.
 *  - totalOrderCost = what the driver COLLECTS (total − store credit,
 *    clamped ≥ 0) — deliberate money semantics (Luigi 2026-07-04): prepaid
 *    orders send 0.00 so no driver ever collects at the door. paymentMethod
 *    is deliberately OMITTED: ShipDay's enum (cash | credit_card) would make
 *    creditCardType/creditCardId required; totalOrderCost already carries
 *    the collect-nothing signal.
 *  - orderItem: line items so the dashboard/driver app show the food.
 */
import { sanitizePhone } from "@/lib/phone";

export type DispatchInput = {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string;
  customerLat?: number | null;
  customerLng?: number | null;
  restaurantName: string;
  restaurantAddress: string;
  restaurantPhone: string | null;
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  /** Pre-tax subtotal in dollars. */
  subtotal: number;
  /** Tax in dollars. */
  taxAmount: number;
  /** Delivery fee in dollars (what the customer paid). */
  deliveryFee: number;
  /** Tip in dollars. */
  tip: number;
  /** Order total in dollars (gross — before store credit). */
  total: number;
  /** Reward Dollars / store credit already paid in dollars (Order.creditApplied).
   *  Deducted from totalOrderCost so a COD driver collects total − credit,
   *  never the gross total (Luigi 2026-07-02 money normalization). This is a
   *  PAYMENT fact, not a display toggle — no rewardsEnabled gate. */
  creditApplied?: number;
  /** Restaurant-set prep time in minutes. Used to compute expectedPickupTime. */
  preparationMinutes: number;
  deliveryInstruction: string | null;
  /** Line items for the ShipDay dashboard/driver app ({name, quantity,
   *  unitPrice}). Optional — totals stay authoritative either way. */
  items?: Array<{ name: string; quantity: number; unitPrice: number }>;
};

/**
 * Map a ShipDay webhook event type to our internal Order.status value.
 *
 * The DOCUMENTED event vocabulary (docs.shipday.com/reference/
 * order-status-update-2) is: ORDER_ASSIGNED, ORDER_ACCEPTED_AND_STARTED,
 * ORDER_ONTHEWAY, ORDER_COMPLETED, ORDER_FAILED, ORDER_INCOMPLETE,
 * ORDER_DELETE, ORDER_INSERTED, ORDER_PIKEDUP (ShipDay's own spelling —
 * keep the typo!), ORDER_UNASSIGNED, ORDER_PIKEDUP_REMOVED,
 * ORDER_ONTHEWAY_REMOVED, ORDER_POD_UPLOAD. Our original guessed names
 * (ORDER_PICKED_UP, ORDER_ONTHEWAY_STATUS, ORDER_FAILED_DELIVERY,
 * ORDER_DELETED) are kept as aliases. Found live 2026-07-12: Luigi's
 * delivered order never completed because the real event names + payload
 * shape didn't match what we listened for.
 *
 * Returns null/null when the event doesn't translate (assignment shuffles,
 * proof-of-delivery uploads — tracked or ignored, never Order.status).
 */
export function translateShipdayEvent(event: string): {
  shipdayStatus: string | null;
  orderStatus: string | null;
} {
  switch (event) {
    case "ORDER_ASSIGNED":
    case "ORDER_DRIVER_ASSIGNED":
      return { shipdayStatus: "assigned", orderStatus: null };
    case "ORDER_ACCEPTED_AND_STARTED":
      return { shipdayStatus: "started", orderStatus: null };
    case "ORDER_PIKEDUP": // ShipDay's documented spelling
    case "ORDER_PICKED_UP":
      return { shipdayStatus: "picked_up", orderStatus: "ready" };
    case "ORDER_ONTHEWAY":
    case "ORDER_ONTHEWAY_STATUS":
      return { shipdayStatus: "picked_up", orderStatus: "ready" };
    case "ORDER_COMPLETED":
      return { shipdayStatus: "delivered", orderStatus: "completed" };
    case "ORDER_FAILED":
    case "ORDER_FAILED_DELIVERY":
    case "ORDER_INCOMPLETE":
      return { shipdayStatus: "failed", orderStatus: null };
    case "ORDER_DELETE":
    case "ORDER_DELETED":
    case "ORDER_CANCELLED":
      return { shipdayStatus: "cancelled", orderStatus: null };
    case "ORDER_UNASSIGNED":
      return { shipdayStatus: "unassigned", orderStatus: null };
    // Backward driver corrections — undo the shipdayStatus, never touch
    // Order.status (the forward-only guard in the webhook protects it anyway).
    case "ORDER_PIKEDUP_REMOVED":
    case "ORDER_ONTHEWAY_REMOVED":
      return { shipdayStatus: "assigned", orderStatus: null };
    default:
      // ORDER_INSERTED, ORDER_POD_UPLOAD, future events → acknowledged, ignored.
      return { shipdayStatus: null, orderStatus: null };
  }
}

export function buildShipdayOrderBody(input: DispatchInput, now: Date): Record<string, unknown> {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pickupAt = new Date(now.getTime() + input.preparationMinutes * 60_000);
  const deliveryAt = new Date(pickupAt.getTime() + 25 * 60_000);
  const timeOf = (d: Date) => d.toISOString().slice(11, 19);
  const dateOf = (d: Date) => d.toISOString().slice(0, 10);

  return {
    orderNumber: input.orderNumber,
    customerName: input.customerName,
    customerAddress: input.customerAddress,
    customerEmail: input.customerEmail ?? undefined,
    customerPhoneNumber: sanitizePhone(input.customerPhone) ?? input.customerPhone ?? undefined,
    restaurantName: input.restaurantName,
    restaurantAddress: input.restaurantAddress,
    restaurantPhoneNumber: sanitizePhone(input.restaurantPhone) ?? input.restaurantPhone ?? undefined,
    expectedPickupTime: timeOf(pickupAt),
    expectedDeliveryDate: dateOf(deliveryAt),
    expectedDeliveryTime: timeOf(deliveryAt),
    orderItem: (input.items ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: r2(i.unitPrice),
    })),
    pickupLatitude: input.restaurantLat ?? undefined,
    pickupLongitude: input.restaurantLng ?? undefined,
    deliveryLatitude: input.customerLat ?? undefined,
    deliveryLongitude: input.customerLng ?? undefined,
    tips: r2(input.tip),
    tax: r2(input.taxAmount),
    deliveryFee: r2(input.deliveryFee),
    totalOrderCost: r2(Math.max(0, input.total - (input.creditApplied ?? 0))),
    deliveryInstruction: input.deliveryInstruction ?? undefined,
    orderSource: "Fee Free Ordering",
    additionalId: input.orderId,
  };
}
