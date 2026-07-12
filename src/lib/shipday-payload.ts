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
