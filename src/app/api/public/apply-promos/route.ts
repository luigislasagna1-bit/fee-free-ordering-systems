import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { applyPromotions, totalPromoDiscount, type ApplyContext } from "@/lib/promo-engine";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { restaurantSlug, orderType, subtotal, items, couponCode, isNewCustomer, paymentMethod } = body;

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
    subtotal: parseFloat(subtotal),
    items: items ?? [],
    couponCode,
    paymentMethod,
  };

  const results = applyPromotions(activePromos as any, ctx);
  const totalDiscount = totalPromoDiscount(results, ctx.subtotal);
  const hasFreeDelivery = results.some(r => r.type === "free_delivery");

  return NextResponse.json({ applied: results, totalDiscount, hasFreeDelivery });
}
