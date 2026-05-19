import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { isBrandParent } from "@/lib/brand";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Same merge pattern as promotions: own coupons + brand-scoped from parent.
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { parentRestaurantId: true },
  });
  const ownerIds: string[] = [restaurantId];
  if (restaurant?.parentRestaurantId) ownerIds.push(restaurant.parentRestaurantId);

  const coupons = await prisma.coupon.findMany({
    where: {
      OR: [
        { restaurantId },
        { restaurantId: { in: ownerIds }, scope: "brand" },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(coupons);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code, description, discountType, discountValue, minimumOrder, maxUses, expiresAt, scope } = await req.json();

  // Brand-scope gating — same as promotions POST.
  let resolvedScope: "location" | "brand" = "location";
  if (scope === "brand") {
    if (!(await isBrandParent(restaurantId))) {
      return NextResponse.json(
        { error: "Only brand parent restaurants can create chain-wide coupons." },
        { status: 403 },
      );
    }
    resolvedScope = "brand";
  }

  const existing = await prisma.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code } } });
  if (existing) return NextResponse.json({ error: "Coupon code already exists" }, { status: 400 });
  const coupon = await prisma.coupon.create({
    data: {
      restaurantId,
      code,
      description,
      discountType,
      discountValue,
      minimumOrder,
      maxUses,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      scope: resolvedScope,
    },
  });
  return NextResponse.json(coupon, { status: 201 });
}
