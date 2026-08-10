import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireInternalKey } from "@/lib/voice/internal-auth";

export const runtime = "nodejs";

/**
 * GET /api/internal/voice/returning-caller?slug=&phone=<E.164 or digits>
 *
 * The `lookup_returning_caller` tool. A cheap point lookup on the existing
 * @@index([restaurantId, phone]) so Nabil can greet a returning caller by name
 * ("Welcome back, Maria") and offer a fast reorder of their usual. Also reports
 * whether the caller is on the block-list so the service can decline.
 *
 * The caller phone is passed already normalized by the voice service (same
 * sanitize the order route applies before storing `Customer.phone`), so this is
 * an exact-match point lookup, not a scan.
 */
export async function GET(req: NextRequest) {
  const forbidden = requireInternalKey(req);
  if (forbidden) return forbidden;

  const sp = req.nextUrl.searchParams;
  const slug = (sp.get("slug") || "").toLowerCase().trim();
  const phone = (sp.get("phone") || "").trim();
  if (!slug) return NextResponse.json({ error: "Missing slug", code: "missing_slug" }, { status: 400 });
  if (!phone) return NextResponse.json({ error: "Missing phone", code: "missing_phone" }, { status: 400 });

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug, isActive: true },
    select: { id: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found", code: "not_found" }, { status: 404 });

  const [blocked, customer] = await Promise.all([
    prisma.blockedCaller.findUnique({
      where: { restaurantId_phone: { restaurantId: restaurant.id, phone } },
      select: { id: true },
    }),
    prisma.customer.findFirst({
      where: { restaurantId: restaurant.id, phone },
      orderBy: { lastOrderAt: "desc" },
      select: { id: true, name: true, totalOrders: true, lastOrderAt: true },
    }),
  ]);

  if (!customer) {
    return NextResponse.json({ found: false, blocked: !!blocked });
  }

  // Compact last-order summary for a "the usual?" reorder prompt.
  const lastOrder = await prisma.order.findFirst({
    where: { restaurantId: restaurant.id, customerId: customer.id },
    orderBy: { createdAt: "desc" },
    select: {
      orderNumber: true,
      type: true,
      total: true,
      createdAt: true,
      items: { select: { quantity: true, name: true, variantName: true }, take: 12 },
    },
  });

  return NextResponse.json({
    found: true,
    blocked: !!blocked,
    // Kept by the voice session and written to VoiceCall.customerId at the
    // end log — the dashboard's caller-history join depends on it.
    customerId: customer.id,
    name: customer.name,
    orderCount: customer.totalOrders,
    lastOrderAt: customer.lastOrderAt ? customer.lastOrderAt.toISOString() : null,
    lastOrder: lastOrder
      ? {
          orderNumber: lastOrder.orderNumber,
          type: lastOrder.type,
          total: lastOrder.total,
          placedAt: lastOrder.createdAt.toISOString(),
          items: lastOrder.items.map((it) => ({
            quantity: it.quantity,
            name: it.name,
            variant: it.variantName ?? null,
          })),
        }
      : null,
  });
}
