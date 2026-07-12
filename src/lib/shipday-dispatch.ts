/**
 * ShipDay dispatch-now — ONE code path for "send this order to ShipDay",
 * shared by:
 *   1. the accept transition in PATCH /api/orders/[id] (fire-and-forget), and
 *   2. POST /api/admin/orders/[id]/shipday-dispatch — the admin "Send to
 *      ShipDay / Retry" button (awaited; surfaces ShipDay's rejection text).
 *
 * Why the button exists: dispatch failures used to be INVISIBLE — the accept
 * fires once, and when ShipDay rejects (it can do so with HTTP 200 +
 * success:false), the order silently never reaches a driver and there was no
 * way to re-send. Found live on Luigi's first two test orders (2026-07-12).
 *
 * Guards mirror the historical accept-path block exactly; each refusal
 * returns a typed `skipped` code instead of a silent return so the UI can
 * explain itself.
 */
import prisma from "@/lib/db";
import { dispatchOrderToShipday, shouldDispatchToShipday } from "@/lib/shipday";

export type DispatchNowResult =
  | { ok: true; shipdayOrderId: string }
  | {
      ok: false;
      /** Why we refused before even calling ShipDay (undefined = ShipDay itself said no). */
      skipped?:
        | "not_found"
        | "not_delivery"
        | "already_dispatched"
        | "config_off"
        | "order_dead"
        | "missing_address"
        | "not_prepaid";
      error?: string;
    };

export async function dispatchOrderNow(orderId: string): Promise<DispatchNowResult> {
  const full = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      restaurantId: true, type: true, status: true, shipdayOrderId: true,
      orderNumber: true, customerName: true, customerEmail: true,
      customerPhone: true, deliveryAddress: true, deliveryCity: true,
      deliveryZip: true, notes: true, subtotal: true, taxAmount: true,
      deliveryFee: true, tip: true, total: true, creditApplied: true,
      paymentMethod: true, paymentStatus: true, preparationTime: true,
      restaurant: { select: { name: true, address: true, city: true, state: true, zip: true, phone: true, lat: true, lng: true } },
    },
  });
  if (!full) return { ok: false, skipped: "not_found" };
  if (full.type !== "delivery") return { ok: false, skipped: "not_delivery" };
  if (full.shipdayOrderId) return { ok: false, skipped: "already_dispatched" };
  // Dead/undecided orders must not reach a driver: a pending order isn't the
  // restaurant's commitment yet, and killed ones are over.
  if (!["accepted", "preparing", "ready"].includes(full.status)) {
    return { ok: false, skipped: "order_dead" };
  }
  if (!(await shouldDispatchToShipday(full.restaurantId))) {
    return { ok: false, skipped: "config_off" };
  }

  const customerAddress = [full.deliveryAddress, full.deliveryCity, full.deliveryZip].filter(Boolean).join(", ");
  const restaurantAddress = [full.restaurant.address, full.restaurant.city, full.restaurant.state, full.restaurant.zip].filter(Boolean).join(", ");
  if (!customerAddress || !restaurantAddress) {
    console.error("[shipday dispatchOrderNow] missing address", { orderId });
    return { ok: false, skipped: "missing_address" };
  }

  // ShipDay orders MUST be prepaid (Luigi 2026-07-04): the driver only picks
  // up + drops off — an unpaid order would be uncollectable. "Prepaid" = the
  // online charge captured OR store credit covering the whole total.
  const fullyPrepaid =
    full.paymentStatus === "paid" || full.total - (full.creditApplied ?? 0) <= 0.009;
  if (!fullyPrepaid) {
    console.warn(`[shipday dispatchOrderNow] REFUSED ${orderId}: not prepaid (method=${full.paymentMethod}, status=${full.paymentStatus})`);
    return { ok: false, skipped: "not_prepaid" };
  }

  const res = await dispatchOrderToShipday(full.restaurantId, {
    orderId,
    orderNumber: full.orderNumber,
    customerName: full.customerName,
    customerEmail: full.customerEmail,
    customerPhone: full.customerPhone,
    customerAddress,
    restaurantName: full.restaurant.name,
    restaurantAddress,
    restaurantPhone: full.restaurant.phone,
    restaurantLat: full.restaurant.lat,
    restaurantLng: full.restaurant.lng,
    subtotal: full.subtotal,
    taxAmount: full.taxAmount,
    deliveryFee: full.deliveryFee,
    tip: full.tip ?? 0,
    total: full.total,
    creditApplied: full.creditApplied ?? 0,
    preparationMinutes: full.preparationTime ?? 30,
    deliveryInstruction: full.notes,
  });
  if (res.ok && res.shipdayOrderId) {
    await prisma.order.update({
      where: { id: orderId },
      data: { shipdayOrderId: res.shipdayOrderId, shipdayStatus: "assigned", dispatchedAt: new Date() },
    });
    return { ok: true, shipdayOrderId: res.shipdayOrderId };
  }
  return { ok: false, error: res.error ?? "ShipDay call failed" };
}
