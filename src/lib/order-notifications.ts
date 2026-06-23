/**
 * "Release" an order — fires the customer confirmation email + the kitchen
 * staff notification + flips `notifiedAt` so the kitchen display picks
 * the order up. Used by two call sites:
 *
 *   1. /api/orders POST (immediately, for cash orders)
 *   2. payment_intent.succeeded webhook (after payment clears, for card orders)
 *
 * Idempotent: re-running on an already-released order is a no-op. This
 * matters because Stripe can deliver the same webhook event more than once
 * (network retry, multiple workers), and we MUST NOT fire two confirmation
 * emails to the customer or two alerts to the kitchen.
 *
 * Idempotency mechanism: notifiedAt is set with an atomic
 * `update where: { id, notifiedAt: null }` — if a parallel call already set
 * it, our updateMany affects 0 rows and we skip the fan-out.
 */

import prisma from "@/lib/db";
import { restaurantOrderUrl } from "@/lib/restaurant-url";
import { notifyStaff, notifyCustomer } from "@/lib/notifications";
import { recordAppliedCoupons } from "@/lib/coupon-ledger";
import { sendKitchenPush } from "@/lib/push";
import { formatCurrency } from "@/lib/utils";

export async function fireOrderNotifications(orderId: string): Promise<{ fired: boolean }> {
  // Atomic claim: only ONE caller wins the right to fire notifications.
  // Returns count = 1 if we won, 0 if someone else already did.
  const claim = await prisma.order.updateMany({
    where: { id: orderId, notifiedAt: null },
    data: { notifiedAt: new Date() },
  });
  if (claim.count === 0) {
    return { fired: false }; // already released by an earlier call
  }

  // Now load the full row to build the email payloads. We do this AFTER
  // the claim so a slow load doesn't widen the race window.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      restaurant: {
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          customDomain: true,
          customDomainStatus: true,
          estimatedPickup: true,
          estimatedDelivery: true,
          defaultLanguage: true,
          currency: true,
        },
      },
      items: {
        select: {
          name: true,
          quantity: true,
          price: true,
          variantName: true,
          notes: true,
          bundleItems: true,
          modifiers: { select: { name: true, priceAdjustment: true } },
        },
      },
    },
  });
  if (!order) {
    console.error(`[fireOrderNotifications] claimed orderId ${orderId} but row vanished`);
    return { fired: false };
  }

  // Reserve-then-order: pull the linked table booking (if any) so the SINGLE
  // order confirmation email also confirms the reservation — "we've received
  // your table reservation AND pre-order". Null for every normal order.
  // Luigi 2026-06-08.
  const linkedReservation = await prisma.reservation.findFirst({
    where: { orderId: order.id },
    select: { partySize: true, date: true, time: true },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  // Parse Order.appliedPromos snapshot so the email + receipt can show
  // the named promo + savings box. Null/malformed → empty array (template
  // hides the box). Free-delivery entries already carry the saved
  // delivery fee as their discount, frozen at order-create time.
  let appliedPromosForEmail: Array<{ name: string; type: string; discount: number; couponCode?: string }> | undefined;
  let appliedPromoIds: string[] = [];
  if ((order as any).appliedPromos) {
    try {
      const parsed = JSON.parse((order as any).appliedPromos);
      if (Array.isArray(parsed) && parsed.length > 0) {
        appliedPromosForEmail = parsed;
        appliedPromoIds = parsed.map((p: any) => p?.promoId).filter((x: unknown): x is string => typeof x === "string" && !!x);
      }
    } catch { /* malformed JSON — leave undefined */ }
  }

  // ── Coupon ledger: record the campaign / once-per-lifetime promos this order
  // applied, NOW that it's actually LIVE (released to the kitchen). Doing it at
  // release — not at order-create — means an abandoned unpaid card order never
  // reserves the coupon, so the customer can freely retry; only a real, released
  // order ties up the offer (and it's released again if later missed/cancelled).
  // Awaited (fast, internally safe) so the row exists before any completion/
  // release hook can act on it. Luigi 2026-06-09.
  if (appliedPromoIds.length > 0) {
    await recordAppliedCoupons({
      restaurantId: (order as any).restaurantId,
      orderId: order.id,
      email: order.customerEmail,
      phone: order.customerPhone,
      customerId: (order as any).customerId ?? null,
      appliedPromoIds,
    });
  }

  // Map order items for the email — include each item's own modifiers AND, for
  // combo/bundle lines, the child picks + their options, so the email lists
  // everything (items, sizes, toppings, sauces). The OrderItem.name already
  // carries the variant for regular items; combos carry their parts in
  // bundleItems. (i.name already includes variant text where applicable.)
  const emailItems = order.items.map((i: any) => {
    const bundle = Array.isArray(i.bundleItems) ? (i.bundleItems as any[]) : null;
    return {
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      modifiers: Array.isArray(i.modifiers) && i.modifiers.length > 0
        ? i.modifiers.map((m: any) => ({ label: "", value: m.name, priceAdjustment: m.priceAdjustment || 0 }))
        : undefined,
      notes: i.notes ?? undefined,
      bundleItems: bundle
        ? bundle.map((c: any) => ({
            name: String(c?.name ?? ""),
            variantName: c?.variantName ?? null,
            modifiers: Array.isArray(c?.modifiers)
              ? c.modifiers.map((m: any) => ({ name: String(m?.name ?? "") }))
              : undefined,
          }))
        : undefined,
    };
  });

  // Customer confirmation email — fire-and-forget so a Resend hiccup
  // doesn't fail the webhook (Stripe would retry the whole event).
  notifyCustomer({
    restaurantId: order.restaurant.id,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    orderType: order.type,
    customerLocale: order.restaurant.defaultLanguage || "en",
    payload: {
      event: "orderConfirmed",
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      items: emailItems,
      total: order.total,
      orderType: order.type,
      estimatedTime: order.type === "pickup"
        ? order.restaurant.estimatedPickup
        : order.restaurant.estimatedDelivery,
      // Scheduled ("order for later") slot — drives the prominent scheduled
      // line on the confirmation email. Null = ASAP. Luigi 2026-06-05.
      scheduledFor: (order as any).scheduledFor ?? null,
      // Reserve-then-order: the table booking attached to this order, so the
      // confirmation email states the reservation too. Luigi 2026-06-08.
      reservation: linkedReservation
        ? { partySize: linkedReservation.partySize, date: linkedReservation.date, time: linkedReservation.time }
        : undefined,
      trackingUrl: restaurantOrderUrl(order.restaurant, `/status/${order.id}`),
      appliedPromos: appliedPromosForEmail,
    },
  }).catch((e) => console.error("[fireOrderNotifications] notifyCustomer:", e));

  notifyStaff({
    restaurantId: order.restaurant.id,
    payload: {
      event: "orderPlaced",
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      total: order.total,
      dashboardUrl: `${baseUrl}/admin/orders`,
      // Reserve-then-order: the STORE copy also flags the table booking, so the
      // kitchen email reads "table reservation + pre-order". Luigi 2026-06-08.
      reservation: linkedReservation
        ? { partySize: linkedReservation.partySize, date: linkedReservation.date, time: linkedReservation.time }
        : undefined,
    },
  }).catch((e) => console.error("[fireOrderNotifications] notifyStaff:", e));

  // Native push to the kitchen's registered devices (phone/tablet) so a NEW
  // ORDER rings even with the screen off / app backgrounded. Fire-and-forget —
  // a push hiccup must NEVER fail order release. Gated: a silent no-op until
  // FIREBASE_SERVICE_ACCOUNT is set AND a device has registered. Body is
  // language-neutral (order data only). Luigi 2026-06-15.
  //
  // Closed-when-placed orders defer their alert to opening (alertAt in the
  // future) — do NOT fire the loud alarm overnight. The order shows parked in
  // the kitchen and the in-app ring picks it up when staff next open the app.
  const pushDeferred = (order as any).alertAt && new Date((order as any).alertAt).getTime() > Date.now();
  if (!pushDeferred) {
    sendKitchenPush(order.restaurant.id, {
      title: order.restaurant.name || "New order",
      body: `#${order.orderNumber} · ${order.customerName} · ${formatCurrency(order.total, order.restaurant.currency)}`,
      data: { type: "new_order", orderId: order.id },
    }).catch((e) => console.error("[fireOrderNotifications] sendKitchenPush:", e));
  }

  return { fired: true };
}
