/**
 * GET /api/kitchen/print-job/[orderId]
 *
 * Returns ESC/POS-encoded receipt bytes for the given order, base64-
 * encoded. Used by the kitchen native app's DirectPrinter plugin —
 * the app fetches this, then passes the bytes straight to the LAN
 * printer over a TCP socket. No PrintNode round-trip.
 *
 * Auth: kitchen session. The order must belong to the kitchen's
 * restaurant — same scoping rules as the existing /api/kitchen/orders
 * polling endpoint.
 *
 * Query params:
 *   width — "58" or "80" (paper width in mm). Default 80. Determines
 *           the character width for layout calculations (58mm = 32
 *           chars, 80mm = 48 chars on a typical Star/Epson).
 *
 * Response: { ok: true, bytes: "<base64>" } on success.
 *           404 if the order isn't visible to the caller.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";
import { EscPosBuilder } from "@/lib/escpos";
import { formatCurrency } from "@/lib/utils";

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
  const width = req.nextUrl.searchParams.get("width") === "58" ? 58 : 80;
  // Paper width → char count. Standard for monospaced font A on
  // Star/Epson: 58mm = 32 chars, 80mm = 48 chars.
  const widthChars = width === 58 ? 32 : 48;

  // Pull order + items + restaurant. Scope to the caller's restaurant
  // so the kitchen at restaurant A can't print receipts from restaurant
  // B by guessing IDs.
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      restaurantId,
    },
    include: {
      items: {
        include: {
          modifiers: {
            select: { name: true, priceAdjustment: true },
          },
        },
        orderBy: { id: "asc" },
      },
      restaurant: {
        select: {
          name: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          zip: true,
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const r = order.restaurant;
  const b = new EscPosBuilder(widthChars);

  // ─── HEADER ────────────────────────────────────────────────────
  b.align("center").bold(true).doubleSize(true);
  b.textln(r.name.slice(0, Math.floor(widthChars / 2)));
  b.doubleSize(false).bold(false);
  if (r.address) b.textln(r.address);
  const cityLine = [r.city, r.state, r.zip].filter(Boolean).join(", ");
  if (cityLine) b.textln(cityLine);
  if (r.phone) b.textln(r.phone);
  b.newline();

  // ─── ORDER META ────────────────────────────────────────────────
  b.align("left").bold(true).textln(`ORDER #${order.orderNumber}`);
  b.bold(false);
  b.textln(new Date(order.createdAt).toLocaleString());
  if (order.type) {
    b.bold(true).textln(order.type.toUpperCase());
    b.bold(false);
  }
  if (order.customerName) b.textln(`Customer: ${order.customerName}`);
  if (order.customerPhone) b.textln(`Phone: ${order.customerPhone}`);
  if (order.type === "delivery" && order.deliveryAddress) {
    b.textln(`Deliver to:`);
    b.textln(`  ${order.deliveryAddress}`);
    const deliveryLoc = [order.deliveryCity, order.deliveryZip].filter(Boolean).join(", ");
    if (deliveryLoc) b.textln(`  ${deliveryLoc}`);
  }
  if (order.notes) {
    b.newline();
    b.bold(true).textln("** Order Notes **");
    b.bold(false).textln(order.notes);
  }
  b.divider();

  // ─── ITEMS ──────────────────────────────────────────────────────
  for (const it of order.items) {
    const qty = it.quantity ?? 1;
    // Use the persisted subtotal if available (handles modifiers'
    // price adjustments already baked in), otherwise compute.
    const linePrice = formatCurrency(it.subtotal ?? it.price * qty);
    b.bold(true);
    const itemLabel = `${qty}x ${it.variantName ? `${it.name} (${it.variantName})` : it.name}`;
    b.twoCol(itemLabel, linePrice);
    b.bold(false);
    // Each modifier indented under its parent item. ESC/POS doesn't
    // have proper indentation — we fake it with leading spaces.
    for (const m of it.modifiers ?? []) {
      const mPriceStr =
        m.priceAdjustment && m.priceAdjustment > 0
          ? formatCurrency(m.priceAdjustment)
          : "";
      const mLabel = `  + ${m.name}`;
      if (mPriceStr) {
        b.twoCol(mLabel, mPriceStr);
      } else {
        b.textln(mLabel);
      }
    }
    if (it.notes) {
      b.textln(`  Note: ${it.notes}`);
    }
  }
  b.divider();

  // ─── TOTALS ─────────────────────────────────────────────────────
  b.twoCol("Subtotal", formatCurrency(order.subtotal));
  if (order.taxAmount > 0) b.twoCol("Tax", formatCurrency(order.taxAmount));
  if (order.deliveryFee > 0) b.twoCol("Delivery", formatCurrency(order.deliveryFee));
  if (order.tip > 0) b.twoCol("Tip", formatCurrency(order.tip));
  if (order.couponDiscount > 0) b.twoCol("Coupon", `-${formatCurrency(order.couponDiscount)}`);
  if (order.promoDiscount > 0) b.twoCol("Promo", `-${formatCurrency(order.promoDiscount)}`);
  b.bold(true).doubleSize(true);
  b.twoCol("TOTAL", formatCurrency(order.total));
  b.doubleSize(false).bold(false);
  b.newline();

  // ─── PAYMENT ────────────────────────────────────────────────────
  if (order.paymentMethod) {
    b.align("left").textln(`Payment: ${order.paymentMethod.replace(/_/g, " ")}`);
  }

  // ─── FOOTER ─────────────────────────────────────────────────────
  b.newline();
  b.align("center").textln("Thank you!");
  b.feed(1).cut();

  return NextResponse.json({
    ok: true,
    orderId: order.id,
    width,
    bytes: b.buildBase64(),
  });
}
