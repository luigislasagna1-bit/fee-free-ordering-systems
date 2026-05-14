import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const promotions = await prisma.promotion.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(promotions);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    name, description, promotionType, isActive, stackingRule, orderType, customerType,
    minimumOrder, rules, daysOfWeek, startsAt, endsAt, usageLimit, autoApply, couponCode,
  } = body;

  if (!name || !promotionType) {
    return NextResponse.json({ error: "name and promotionType required" }, { status: 400 });
  }

  // Unique coupon code per restaurant
  if (couponCode) {
    const existing = await prisma.promotion.findFirst({
      where: { restaurantId, couponCode: { equals: couponCode } },
    });
    if (existing) {
      return NextResponse.json({ error: "Coupon code already in use" }, { status: 409 });
    }
  }

  const promo = await prisma.promotion.create({
    data: {
      restaurantId,
      name,
      description: description || null,
      promotionType,
      isActive: isActive ?? true,
      stackingRule: stackingRule ?? "standard",
      orderType: orderType ?? "both",
      customerType: customerType ?? "any",
      minimumOrder: minimumOrder ?? 0,
      rules: typeof rules === "string" ? rules : JSON.stringify(rules ?? {}),
      daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
      startsAt: startsAt ? new Date(startsAt) : null,
      endsAt: endsAt ? new Date(endsAt) : null,
      usageLimit: usageLimit ?? null,
      autoApply: autoApply ?? true,
      couponCode: couponCode || null,
    },
  });

  return NextResponse.json(promo, { status: 201 });
}
