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
import { notifyStaff, notifyCustomer } from "@/lib/notifications";

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
          estimatedPickup: true,
          estimatedDelivery: true,
          defaultLanguage: true,
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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

  // Parse Order.appliedPromos snapshot so the email + receipt can show
  // the named promo + savings box. Null/malformed → empty array (template
  // hides the box). Free-delivery entries already carry the saved
  // delivery fee as their discount, frozen at order-create time.
  let appliedPromosForEmail: Array<{ name: string; type: string; discount: number; couponCode?: string }> | undefined;
  if ((order as any).appliedPromos) {
    try {
      const parsed = JSON.parse((order as any).appliedPromos);
      if (Array.isArray(parsed) && parsed.length > 0) appliedPromosForEmail = parsed;
    } catch { /* malformed JSON — leave undefined */ }
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
      trackingUrl: `${baseUrl}/order/${order.restaurant.slug}/status/${order.id}`,
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
    },
  }).catch((e) => console.error("[fireOrderNotifications] notifyStaff:", e));

  return { fired: true };
}
