import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { isSuperadmin } from "@/lib/roles";

/**
 * POST /api/superadmin/resellers/[id]/reassign-restaurant
 * body: { restaurantId, newResellerProfileId?: string | null }
 *
 * Moves a restaurant out from under one reseller. If newResellerProfileId is
 * omitted or explicitly null, the restaurant becomes unattributed (direct).
 * Also wipes any RestaurantAccess rows that came from the old reseller's
 * user — otherwise stale access lingers after attribution moves.
 *
 * Does NOT retroactively rewrite past CommissionTransaction rows; commissions
 * already earned under the old reseller stay with them.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!isSuperadmin(user?.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: oldResellerProfileId } = await params;
  const body = await req.json().catch(() => ({}));
  const restaurantId: string | undefined = body?.restaurantId;
  const newResellerProfileId: string | null = body?.newResellerProfileId ?? null;

  if (!restaurantId) {
    return NextResponse.json({ error: "Missing restaurantId" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, resellerProfileId: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  if (restaurant.resellerProfileId !== oldResellerProfileId) {
    return NextResponse.json({ error: "Restaurant is not under that reseller" }, { status: 409 });
  }

  if (newResellerProfileId) {
    const newProfile = await prisma.resellerProfile.findUnique({
      where: { id: newResellerProfileId },
      select: { status: true },
    });
    if (!newProfile) return NextResponse.json({ error: "Target reseller not found" }, { status: 404 });
    if (newProfile.status !== "approved") {
      return NextResponse.json({ error: "Target reseller is not approved" }, { status: 409 });
    }
  }

  const oldReseller = await prisma.resellerProfile.findUnique({
    where: { id: oldResellerProfileId },
    select: { userId: true },
  });

  await prisma.$transaction([
    prisma.restaurant.update({
      where: { id: restaurantId },
      data: { resellerProfileId: newResellerProfileId },
    }),
    // Strip stale access for the old reseller's user on this restaurant.
    ...(oldReseller
      ? [
          prisma.restaurantAccess.deleteMany({
            where: { userId: oldReseller.userId, restaurantId },
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true });
}
