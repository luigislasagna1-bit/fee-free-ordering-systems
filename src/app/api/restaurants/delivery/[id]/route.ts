import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingSetting } from "@/lib/brand";

async function getRestaurantId() {
  const user = await getSessionUser();
  return user?.restaurantId ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingSetting(restaurantId, "zones");
  if (blocked) return blocked;
  const { id } = await params;

  const body = await req.json();
  const { name, color, radiusKm, deliveryFee, minimumOrder, estimatedMinutes, isActive, sortOrder } = body;

  // Re-lock center to restaurant coords on every save (concentric rings).
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { lat: true, lng: true },
  });

  const zone = await prisma.deliveryZone.update({
    where: { id, restaurantId },
    data: {
      ...(name !== undefined && { name }),
      ...(color !== undefined && { color }),
      ...(restaurant?.lat != null && { centerLat: restaurant.lat }),
      ...(restaurant?.lng != null && { centerLng: restaurant.lng }),
      ...(radiusKm !== undefined && { radiusKm }),
      ...(deliveryFee !== undefined && { deliveryFee }),
      ...(minimumOrder !== undefined && { minimumOrder }),
      ...(estimatedMinutes !== undefined && { estimatedMinutes: Math.max(0, Math.round(estimatedMinutes)) }),
      ...(isActive !== undefined && { isActive }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });

  return NextResponse.json(zone);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const restaurantId = await getRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = await blockIfInheritingSetting(restaurantId, "zones");
  if (blocked) return blocked;
  const { id } = await params;
  await prisma.deliveryZone.delete({ where: { id, restaurantId } });
  return NextResponse.json({ ok: true });
}
