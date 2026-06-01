import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { applyPromotions, totalPromoDiscount, type ApplyContext } from "@/lib/promo-engine";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    restaurantSlug, orderType, subtotal, items, couponCode, isNewCustomer, paymentMethod,
    // Phase 2a restriction inputs from the client. The page already
    // resolves the customer's delivery zone via geocoding (for the in-
    // zone fee display) and the member flag from the per-restaurant
    // customer session — forwarding both lets the engine evaluate the
    // Delivery Area + Client Type ("member") restrictions correctly.
    deliveryZoneId, isMember,
  } = body;

  if (!restaurantSlug || subtotal === undefined) {
    return NextResponse.json({ error: "restaurantSlug and subtotal required" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const activePromos = await prisma.promotion.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
  });

  const ctx: ApplyContext = {
    orderType: orderType ?? "pickup",
    isNewCustomer: isNewCustomer ?? false,
    isMember: isMember ?? false,
    subtotal: parseFloat(subtotal),
    items: items ?? [],
    couponCode,
    paymentMethod,
    deliveryZoneId: typeof deliveryZoneId === "string" && deliveryZoneId ? deliveryZoneId : undefined,
    // Restaurant's IANA timezone — drives Happy Hour / day-of-week
    // evaluation in the owner's local time, not the Vercel UTC clock.
    // Without this the Italian "15:00–18:00" window was being matched
    // against UTC and silently failing for any customer whose local
    // hour differed from UTC (Luigi 2026-05-31, Italian beta tester).
    restaurantTimezone: restaurant.timezone,
  };

  const results = applyPromotions(activePromos as any, ctx);
  const totalDiscount = totalPromoDiscount(results, ctx.subtotal);
  const hasFreeDelivery = results.some(r => r.type === "free_delivery");

  return NextResponse.json({ applied: results, totalDiscount, hasFreeDelivery });
}
