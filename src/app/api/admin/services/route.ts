import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

const DEFAULT_SETTINGS = {
  pickup:       { displayName: "Pickup",             description: "", estimatedTime: 20 },
  delivery:     { displayName: "Delivery",           description: "", estimatedTime: 45 },
  dineIn:       { displayName: "Dine-In",            description: "", estimatedTime: 15 },
  catering:     { displayName: "Catering",           description: "", estimatedTime: 60 },
  takeOut:      { displayName: "Take Out",           description: "", estimatedTime: 20 },
  reservations: { displayName: "Table Reservations", description: "", estimatedTime: 0  },
};

export async function GET() {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        acceptsPickup: true,
        acceptsDelivery: true,
        acceptsDineIn: true,
        acceptsCatering: true,
        acceptsTakeOut: true,
        acceptsReservations: true,
        estimatedPickup: true,
        estimatedDelivery: true,
        serviceSettings: true,
      },
    });

    const settings = restaurant?.serviceSettings
      ? JSON.parse(restaurant.serviceSettings)
      : DEFAULT_SETTINGS;

    return NextResponse.json({
      enabled: {
        pickup:       restaurant?.acceptsPickup ?? true,
        delivery:     restaurant?.acceptsDelivery ?? false,
        dineIn:       restaurant?.acceptsDineIn ?? false,
        catering:     restaurant?.acceptsCatering ?? false,
        takeOut:      restaurant?.acceptsTakeOut ?? false,
        reservations: restaurant?.acceptsReservations ?? false,
      },
      settings: { ...DEFAULT_SETTINGS, ...settings },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { enabled, settings } = body;

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        acceptsPickup:       enabled?.pickup       ?? undefined,
        acceptsDelivery:     enabled?.delivery     ?? undefined,
        acceptsDineIn:       enabled?.dineIn       ?? undefined,
        acceptsCatering:     enabled?.catering     ?? undefined,
        acceptsTakeOut:      enabled?.takeOut      ?? undefined,
        acceptsReservations: enabled?.reservations ?? undefined,
        estimatedPickup:     settings?.pickup?.estimatedTime    ?? undefined,
        estimatedDelivery:   settings?.delivery?.estimatedTime  ?? undefined,
        serviceSettings:     JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
