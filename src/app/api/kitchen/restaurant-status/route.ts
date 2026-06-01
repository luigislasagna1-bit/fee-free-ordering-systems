/**
 * GET /api/kitchen/restaurant-status
 *
 * Returns the current pause-state for the kitchen's restaurant. Used by
 * RestaurantStatusModal to refresh after a save (so the button label
 * + per-service "paused until" timestamps reflect what's actually in
 * the DB without a full page reload).
 *
 * Auth: kitchen-session scoped.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { kitchenAuthOptions } from "@/lib/auth-kitchen";
import prisma from "@/lib/db";

export async function GET() {
  const session = await getServerSession(kitchenAuthOptions);
  const restaurantId = (session?.user as any)?.restaurantId as string | undefined;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      pickupPausedUntil: true,
      deliveryPausedUntil: true,
      dineInPausedUntil: true,
      cateringPausedUntil: true,
      takeOutPausedUntil: true,
      reservationsPausedUntil: true,
    },
  });
  return NextResponse.json(r ?? {});
}
