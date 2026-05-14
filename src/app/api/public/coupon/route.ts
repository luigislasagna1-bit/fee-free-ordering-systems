import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  // Rate limit: 10 coupon attempts per IP per minute to prevent brute-force
  const ip = getClientIp(req);
  if (!rateLimit(`coupon:${ip}`, 10, 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Please wait before trying again." }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code")?.toUpperCase().trim().slice(0, 50);
  const restaurantSlug = searchParams.get("restaurantSlug")?.trim().slice(0, 100);
  const subtotal = Math.max(0, parseFloat(searchParams.get("subtotal") || "0"));

  if (!code || !restaurantSlug) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

  const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const coupon = await prisma.coupon.findUnique({
    where: { restaurantId_code: { restaurantId: restaurant.id, code } },
  });

  if (!coupon || !coupon.isActive) return NextResponse.json({ error: "Invalid or expired coupon" }, { status: 400 });
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return NextResponse.json({ error: "Coupon has expired" }, { status: 400 });
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) return NextResponse.json({ error: "Coupon has reached its usage limit" }, { status: 400 });
  if (coupon.minimumOrder > 0 && subtotal < coupon.minimumOrder) {
    return NextResponse.json({ error: `Minimum order of $${coupon.minimumOrder.toFixed(2)} required` }, { status: 400 });
  }

  const discount = coupon.discountType === "percentage"
    ? Math.min(subtotal * (coupon.discountValue / 100), subtotal)
    : Math.min(coupon.discountValue, subtotal);

  return NextResponse.json({ id: coupon.id, discount: Math.round(discount * 100) / 100 });
}
