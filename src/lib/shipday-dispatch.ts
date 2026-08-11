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
import { dispatchOrderToShipday, shouldDispatchToShipday, shipdayPayAtDoorEnabled } from "@/lib/shipday";

export type DispatchNowResult =
  | {
      ok: true;
      shipdayOrderId: string;
      /** True when the order was WRITTEN to ShipDay for visibility but no
       *  driver was requested — pay-at-door delivery the store fulfils itself. */
      recordOnly?: boolean;
    }
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
      deliveryZip: true, deliveryLat: true, deliveryLng: true,
      notes: true, subtotal: true, taxAmount: true,
      deliveryFee: true, tip: true, total: true, creditApplied: true,
      paymentMethod: true, paymentStatus: true, preparationTime: true,
      scheduledFor: true,
      items: { select: { name: true, quantity: true, price: true } },
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
  //
  // PAY AT THE DOOR (Luigi 2026-08-11) is the one exception, and it is NOT a
  // dispatch: when the store has opted in, an unpaid delivery is still WRITTEN
  // to ShipDay so the owner sees it in the dashboard they already live in, but
  // it is recorded as `record_only` — the store delivers it themselves. Without
  // the opt-in the historic refusal is unchanged.
  const fullyPrepaid =
    full.paymentStatus === "paid" || full.total - (full.creditApplied ?? 0) <= 0.009;
  let recordOnly = false;
  if (!fullyPrepaid) {
    if (!(await shipdayPayAtDoorEnabled(full.restaurantId))) {
      console.warn(`[shipday dispatchOrderNow] REFUSED ${orderId}: not prepaid (method=${full.paymentMethod}, status=${full.paymentStatus})`);
      return { ok: false, skipped: "not_prepaid" };
    }
    recordOnly = true;
  }

  // CLAIM-BEFORE-SEND (2026-08-10, same pattern as the autopilot fix): since
  // the auto-accept fix there are FIVE possible triggers (kitchen Accept,
  // payment-verify, Stripe webhook, creation, watchdog) and ShipDay has no
  // unique constraint protecting us — two concurrent callers passing the
  // read-guards above would BOTH insert, and the customer gets two drivers.
  // Atomically lease the order by stamping dispatchedAt; the loser sees
  // count=0 and reports already_dispatched. A lease older than 3 min with no
  // shipdayOrderId is a crashed attempt — reclaimable, so the watchdog can
  // still rescue it. On a ShipDay failure the lease is cleared immediately so
  // the manual Retry button works without waiting out the lease.
  const claim = await prisma.order.updateMany({
    where: {
      id: orderId,
      shipdayOrderId: null,
      OR: [{ dispatchedAt: null }, { dispatchedAt: { lt: new Date(Date.now() - 3 * 60_000) } }],
    },
    data: { dispatchedAt: new Date() },
  });
  if (claim.count === 0) return { ok: false, skipped: "already_dispatched" };

  const res = await dispatchOrderToShipday(full.restaurantId, {
    orderId,
    orderNumber: full.orderNumber,
    customerName: full.customerName,
    customerEmail: full.customerEmail,
    customerPhone: full.customerPhone,
    customerAddress,
    // Exact checkout-time pin — ShipDay skips its own geocoding when
    // coordinates are provided, so the driver goes where the customer
    // actually pointed, not where the address string happens to resolve.
    customerLat: full.deliveryLat,
    customerLng: full.deliveryLng,
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
    // Pre-orders anchor ShipDay's expected times on the customer's requested
    // time — dispatch may run long before cook time (auto-accept capture).
    scheduledFor: full.scheduledFor,
    deliveryInstruction: full.notes,
    items: full.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.price })),
  });
  if (res.ok && res.shipdayOrderId) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        shipdayOrderId: res.shipdayOrderId,
        // `record_only` is the pay-at-door marker: the order exists in ShipDay
        // for the owner's records, but no driver was requested and the store
        // is delivering it. Anything that reads shipdayStatus (kitchen chips,
        // admin order page) can therefore tell the two apart.
        shipdayStatus: recordOnly ? "record_only" : "assigned",
        dispatchedAt: new Date(),
      },
    });
    // Only present when TRUE, so the ordinary dispatch result stays exactly the
    // shape every existing caller (and test) already matches on.
    return { ok: true, shipdayOrderId: res.shipdayOrderId, ...(recordOnly ? { recordOnly: true as const } : {}) };
  }
  // ShipDay said no (or the call failed) — release the lease so the manual
  // Retry button and the watchdog can try again immediately.
  await prisma.order.updateMany({
    where: { id: orderId, shipdayOrderId: null },
    data: { dispatchedAt: null },
  });
  return { ok: false, error: res.error ?? "ShipDay call failed" };
}
