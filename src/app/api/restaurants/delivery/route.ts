import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingSetting } from "@/lib/brand";

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const zones = await prisma.deliveryZone.findMany({
    where: { restaurantId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(zones);
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A child inheriting its delivery zones from the brand can't add one here.
  const blocked = await blockIfInheritingSetting(restaurantId, "zones");
  if (blocked) return blocked;

  const { name, color, radiusKm, deliveryFee, minimumOrder, estimatedMinutes } = await req.json();
  if (!name) return NextResponse.json({ error: "Zone name is required" }, { status: 400 });

  // Zone centers are always the restaurant's coordinates (concentric rings).
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { lat: true, lng: true },
  });
  if (!restaurant?.lat || !restaurant?.lng) {
    return NextResponse.json(
      { error: "Set your restaurant address on the Profile page before creating delivery zones." },
      { status: 400 },
    );
  }

  const count = await prisma.deliveryZone.count({ where: { restaurantId } });
  const zone = await prisma.deliveryZone.create({
    data: {
      restaurantId,
      name,
      color: color ?? "#10b981",
      centerLat: restaurant.lat,
      centerLng: restaurant.lng,
      radiusKm: radiusKm ?? 5,
      deliveryFee: deliveryFee ?? 0,
      minimumOrder: minimumOrder ?? 0,
      estimatedMinutes: typeof estimatedMinutes === "number" && estimatedMinutes >= 0 ? Math.round(estimatedMinutes) : 30,
      sortOrder: count,
    },
  });
  return NextResponse.json(zone, { status: 201 });
}
