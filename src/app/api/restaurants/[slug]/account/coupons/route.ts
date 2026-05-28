/**
 * GET /api/restaurants/[slug]/account/coupons
 *
 * Returns coupons assigned to the currently-logged-in per-restaurant
 * customer at this restaurant, plus any open-redeem coupons that are
 * publicly listed (none today — open-redeem coupons are share-by-code
 * only and not surfaced here to avoid leaking active codes to drive-by
 * accounts). Logged-out customers get an empty list.
 *
 * Output: { coupons: Array<{ id, code, description, discountType,
 *   discountValue, minimumOrder, expiresAt }> }
 */

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!restaurant) return NextResponse.json({ coupons: [] });

  const customer = await getCurrentRestaurantCustomer({
    expectedRestaurantId: restaurant.id,
  });
  if (!customer) return NextResponse.json({ coupons: [] });

  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: {
      restaurantId: restaurant.id,
      customerId: customer.id,
      isActive: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: {
      id: true, code: true, description: true,
      discountType: true, discountValue: true,
      minimumOrder: true, maxUses: true, usedCount: true,
      expiresAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Filter out used-up coupons (maxUses reached). Could also be expressed
  // in the SQL WHERE but the conditional comparison is awkward in
  // Prisma's query builder — small list, post-filter in JS is fine.
  const usable = coupons.filter((c) => c.maxUses === null || c.usedCount < c.maxUses);
  return NextResponse.json({ coupons: usable });
}
