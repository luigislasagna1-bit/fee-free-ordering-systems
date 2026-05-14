import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";


import prisma from "@/lib/db";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const coupons = await prisma.coupon.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(coupons);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code, description, discountType, discountValue, minimumOrder, maxUses, expiresAt } = await req.json();
  const existing = await prisma.coupon.findUnique({ where: { restaurantId_code: { restaurantId, code } } });
  if (existing) return NextResponse.json({ error: "Coupon code already exists" }, { status: 400 });
  const coupon = await prisma.coupon.create({
    data: { restaurantId, code, description, discountType, discountValue, minimumOrder, maxUses, expiresAt: expiresAt ? new Date(expiresAt) : null },
  });
  return NextResponse.json(coupon, { status: 201 });
}
