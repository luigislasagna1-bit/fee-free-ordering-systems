/**
 * Shared receipt-payload builder for the kitchen print paths.
 *
 * Used by BOTH the session-authed GET /api/kitchen/print-job/[orderId] (the
 * app-open web print + manual reprint) AND the token-authed
 * GET /api/kitchen/print-job-token (the native BACKGROUND print that runs while
 * the kitchen app is closed). One builder so a ticket printed from the
 * background service is byte-identical to one printed from the open app.
 * Luigi 2026-06-22.
 *
 * Returns BOTH formats: `bytes` (base64 ESC/POS, raw-TCP fallback for non-Star)
 * and `lines` (structured ReceiptLine[] for the StarXpand bitmap renderer).
 */
import prisma from "@/lib/db";
import { parseReceiptConfig } from "@/lib/receipt-schema";
import {
  buildKitchenReceiptFromConfig,
  buildCustomerReceiptFromConfig,
  type ReceiptOrder,
  type ReceiptRestaurant,
} from "@/lib/receipt";
import { buildKitchenReceiptLines, buildCustomerReceiptLines } from "@/lib/receipt-lines";
import { fetchDriveEstimate, resolveDistanceMatrixKey, cardinalDirection } from "@/lib/delivery-eta";
import { resolveEffectiveMapsKey } from "@/lib/platform-maps";

export type ReceiptPayload =
  | { ok: true; bytes: string; lines: any[]; width: 58 | 80 }
  | { ok: false; status: number; error: string };

export async function buildOrderReceiptPayload(opts: {
  orderId: string;
  restaurantId: string;
  type: "kitchen" | "customer";
  paperWidth: "58mm" | "80mm";
}): Promise<ReceiptPayload> {
  const { orderId, restaurantId, type: receiptType, paperWidth } = opts;

  // Order + items + restaurant — scoped to the caller's restaurant so a guessed
  // ID can't print another restaurant's receipt.
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: {
      items: {
        include: { modifiers: { select: { name: true, priceAdjustment: true } } },
        orderBy: { id: "asc" },
      },
      restaurant: {
        select: {
          name: true, phone: true, email: true,
          address: true, city: true, state: true, zip: true, currency: true,
          timezone: true, hoursFormat: true, receiptLogoUrl: true,
        },
      },
    },
  });
  if (!order) return { ok: false, status: 404, error: "Order not found" };

  // Reserve-then-order: the linked booking (if any) so the kitchen ticket prints
  // the "TABLE RESERVATION + PRE-ORDER" flag. Null for normal orders.
  const linkedReservation = await prisma.reservation.findFirst({
    where: { orderId: order.id },
    select: { partySize: true, date: true, time: true },
  });

  const tplRow = await prisma.receiptTemplate.findFirst({
    where: { restaurantId, type: receiptType, isDefault: true },
    select: { template: true },
  });

  const restaurant: ReceiptRestaurant = {
    name: order.restaurant.name,
    address: order.restaurant.address,
    city: order.restaurant.city,
    state: order.restaurant.state,
    zip: order.restaurant.zip,
    phone: order.restaurant.phone,
    email: order.restaurant.email,
    currency: order.restaurant.currency,
    timezone: order.restaurant.timezone,
    hoursFormat: (order.restaurant as any).hoursFormat,
    receiptLogoUrl: (order.restaurant as any).receiptLogoUrl ?? null,
  };

  // Live driving distance/time for delivery receipts — best-effort, fully
  // wrapped, never blocks/breaks the print.
  let driveDistanceText: string | null = null;
  let driveTimeText: string | null = null;
  let driveDirection: string | null = null;
  try {
    if ((order as any).type === "delivery" && (order as any).deliveryAddress) {
      const r = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { lat: true, lng: true, address: true, city: true, state: true, zip: true, googleMapsApiKey: true },
      });
      if (r?.lat != null && r?.lng != null && (order as any).deliveryLat != null && (order as any).deliveryLng != null) {
        driveDirection = cardinalDirection(r.lat, r.lng, (order as any).deliveryLat, (order as any).deliveryLng);
      }
      const key = r ? resolveDistanceMatrixKey(await resolveEffectiveMapsKey(r.googleMapsApiKey)) : null;
      if (r && key) {
        const origin = r.lat != null && r.lng != null
          ? { lat: r.lat, lng: r.lng }
          : { address: [r.address, r.city, r.state, r.zip].filter(Boolean).join(", ") };
        const destination = [(order as any).deliveryAddress, (order as any).deliveryCity].filter(Boolean).join(", ");
        const est = await fetchDriveEstimate({ apiKey: key, origin, destination });
        if (est.ok) {
          driveDistanceText = est.distanceText ?? null;
          driveTimeText = est.durationInTrafficText ?? est.durationText ?? null;
        }
      }
    }
  } catch { /* never block the print */ }

  const receiptOrder: ReceiptOrder = {
    orderNumber: String((order as any).orderNumber ?? order.id.slice(-6).toUpperCase()),
    type: (order as any).type ?? "pickup",
    status: order.status,
    customerName: (order as any).customerName ?? "Guest",
    customerPhone: (order as any).customerPhone,
    customerEmail: (order as any).customerEmail,
    deliveryAddress: (order as any).deliveryAddress,
    deliveryCity: (order as any).deliveryCity,
    deliveryZoneName: (order as any).deliveryZoneName ?? null,
    deliveryEstimatedMinutes: (order as any).deliveryEstimatedMinutes ?? null,
    driveDistanceText, driveTimeText, driveDirection,
    notes: (order as any).notes,
    subtotal: order.subtotal,
    taxAmount: (order as any).taxAmount ?? 0,
    deliveryFee: order.deliveryFee ?? 0,
    tip: (order as any).tip ?? 0,
    couponDiscount: (order as any).couponDiscount ?? 0,
    promoDiscount: (order as any).promoDiscount ?? 0,
    appliedServiceFees: (order as any).appliedServiceFees ?? null,
    appliedPromos: (order as any).appliedPromos ?? null,
    total: order.total,
    paymentMethod: (order as any).paymentMethod ?? "",
    paymentStatus: (order as any).paymentStatus ?? "pending",
    createdAt: order.createdAt,
    scheduledFor: (order as any).scheduledFor ?? null,
    estimatedReady: (order as any).estimatedReady ?? null,
    preparationTime: (order as any).preparationTime ?? null,
    reservation: linkedReservation
      ? { partySize: linkedReservation.partySize, date: linkedReservation.date, time: linkedReservation.time }
      : null,
    items: order.items.map((it: any) => ({
      name: it.name,
      quantity: it.quantity ?? 1,
      price: it.price,
      subtotal: it.subtotal ?? (it.price * (it.quantity ?? 1)),
      notes: it.notes,
      modifiers: (it.modifiers ?? []).map((m: any) => ({ name: m.name, priceAdjustment: m.priceAdjustment ?? 0 })),
      bundleItems: Array.isArray(it.bundleItems) ? it.bundleItems : null,
    })),
  };

  let bytesBuf: Buffer;
  let lines: any[];
  if (receiptType === "customer") {
    const cfg = parseReceiptConfig(tplRow?.template ?? null, "customer");
    bytesBuf = await buildCustomerReceiptFromConfig(receiptOrder, restaurant, cfg, paperWidth, "starprnt", "en");
    lines = await buildCustomerReceiptLines(receiptOrder, restaurant, cfg, paperWidth, "en");
  } else {
    const cfg = parseReceiptConfig(tplRow?.template ?? null, "kitchen");
    bytesBuf = await buildKitchenReceiptFromConfig(receiptOrder, restaurant, cfg, paperWidth, "starprnt", "en");
    lines = await buildKitchenReceiptLines(receiptOrder, restaurant, cfg, paperWidth, "en");
  }

  // Inline logo image bytes server-side so the Android renderer never fetches a
  // URL mid-print. Best-effort: any failure drops the logo line, never blocks.
  if (Array.isArray(lines) && lines.some((l: any) => l?.kind === "image" && l.url)) {
    lines = (
      await Promise.all(
        lines.map(async (l: any) => {
          if (l?.kind !== "image" || !l.url) return l;
          try {
            const res = await fetch(l.url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return null;
            const contentType = res.headers.get("content-type") ?? "";
            if (!/^image\/(png|jpe?g|webp)/i.test(contentType)) return null;
            const buf = Buffer.from(await res.arrayBuffer());
            if (buf.length > 1_500_000) return null;
            const { url: _drop, ...rest } = l;
            return { ...rest, dataBase64: buf.toString("base64") };
          } catch { return null; }
        }),
      )
    ).filter(Boolean);
  }

  return { ok: true, bytes: bytesBuf.toString("base64"), lines, width: paperWidth === "58mm" ? 58 : 80 };
}
