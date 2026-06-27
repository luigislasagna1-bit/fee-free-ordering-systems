/**
 * GET /api/admin/vip-specials/pickable — the restaurant's promotions that can be
 * given as a VIP special (to a group or an individual). Returns a light list for
 * the picker; scoped to the owner's restaurant.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const promotions = await prisma.promotion.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, isActive: true, promotionType: true, ruleConfig: true },
  });
  return NextResponse.json({ promotions });
}
