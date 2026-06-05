/**
 * GET /api/kitchen/print-job/[orderId]
 *
 * Returns the receipt for the given order in TWO formats so the native
 * Capacitor app can print on the broadest range of printers:
 *
 *   - `bytes`  base64-encoded ESC/POS — for raw TCP printing on
 *              Epson / Bixolon / Citizen and other non-Star printers
 *              that accept ESC/POS over port 9100.
 *   - `lines`  structured ReceiptLine[] — for Star printers via the
 *              StarXpand bitmap renderer on Android. Star's TSP-series
 *              firmware silently discards raw ESC/POS over #9100, so
 *              we render text to a bitmap and use the SDK's image-
 *              print path. See `StarXpandBridge.kt`.
 *
 * Both formats are built from the SAME per-restaurant ReceiptTemplate
 * (the same template the admin edits in /admin/receipts and the same
 * template the PrintNode-based browser print uses). So a receipt printed
 * from the kitchen tablet looks identical to one printed via PrintNode,
 * with full bold / size / alignment / highlight styling preserved.
 *
 * Auth: kitchen session. The order must belong to the kitchen's
 * restaurant — caller can't print receipts from other restaurants by
 * guessing IDs.
 *
 * Query params:
 *   width — "58" or "80" (paper width in mm). Default 80.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";
import { parseReceiptConfig } from "@/lib/receipt-schema";
import {
  buildKitchenReceiptFromConfig,
  buildCustomerReceiptFromConfig,
  type ReceiptOrder,
  type ReceiptRestaurant,
} from "@/lib/receipt";
import {
  buildKitchenReceiptLines,
  buildCustomerReceiptLines,
} from "@/lib/receipt-lines";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await params;
  const paperWidth = req.nextUrl.searchParams.get("width") === "58" ? "58mm" : "80mm";
  // type: "kitchen" (default) → big bold ticket for chef. "customer" →
  // itemized receipt with prices + totals. Same vocabulary as the
  // PrintNode flow uses.
  const typeParam = req.nextUrl.searchParams.get("type");
  const receiptType: "kitchen" | "customer" = typeParam === "customer" ? "customer" : "kitchen";

  // Pull order + items + restaurant — scoped to the caller's restaurant.
  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: {
      items: {
        include: {
          modifiers: { select: { name: true, priceAdjustment: true } },
        },
        orderBy: { id: "asc" },
      },
      restaurant: {
        select: {
          name: true, phone: true, email: true,
          address: true, city: true, state: true, zip: true, currency: true,
          timezone: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // ── Load the restaurant's template for the requested receipt type.
  //    Falls back to the DEFAULT_*_CONFIG when no row exists yet, so a
  //    brand-new restaurant still prints a sensible receipt without
  //    configuring anything. Same logic the PrintNode path uses.
  const tplRow = await prisma.receiptTemplate.findFirst({
    where: { restaurantId, type: receiptType, isDefault: true },
    select: { template: true },
  });

  // ── Map Prisma row → ReceiptOrder + ReceiptRestaurant shapes.
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
  };

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
    items: order.items.map((it: any) => ({
      name: it.name,
      quantity: it.quantity ?? 1,
      price: it.price,
      subtotal: it.subtotal ?? (it.price * (it.quantity ?? 1)),
      notes: it.notes,
      modifiers: (it.modifiers ?? []).map((m: any) => ({
        name: m.name,
        priceAdjustment: m.priceAdjustment ?? 0,
      })),
      // Bundle children (Promo Type 8 / 13) — passed through to the
      // receipt renderer so kitchen + customer copies print parent + indented children.
      bundleItems: Array.isArray(it.bundleItems) ? it.bundleItems : null,
    })),
  };

  // ── Build BOTH outputs from the same template ──
  //   ESC/POS bytes  — raw TCP fallback for non-Star printers.
  //   Structured lines — StarXpand bitmap renderer on Android.
  // The "starprnt" language default works for Star + most Star-emulating
  // thermal printers restaurants buy today.
  let bytesBuf: Buffer;
  let lines;
  if (receiptType === "customer") {
    const cfg = parseReceiptConfig(tplRow?.template ?? null, "customer");
    bytesBuf = await buildCustomerReceiptFromConfig(
      receiptOrder, restaurant, cfg, paperWidth, "starprnt", "en",
    );
    lines = await buildCustomerReceiptLines(
      receiptOrder, restaurant, cfg, paperWidth, "en",
    );
  } else {
    const cfg = parseReceiptConfig(tplRow?.template ?? null, "kitchen");
    bytesBuf = await buildKitchenReceiptFromConfig(
      receiptOrder, restaurant, cfg, paperWidth, "starprnt", "en",
    );
    lines = await buildKitchenReceiptLines(
      receiptOrder, restaurant, cfg, paperWidth, "en",
    );
  }

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    width: paperWidth === "58mm" ? 58 : 80,
    type: receiptType,
    bytes: bytesBuf.toString("base64"),
    lines,
  });
}
