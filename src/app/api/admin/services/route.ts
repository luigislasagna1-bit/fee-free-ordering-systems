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
        autoAcceptOrders: true,
        cateringNoticeHours: true,
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
      autoAcceptOrders: restaurant?.autoAcceptOrders ?? false,
      cateringNoticeHours: restaurant?.cateringNoticeHours ?? 24,
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
    const { enabled, settings, autoAcceptOrders, cateringNoticeHours } = body;

    // Clamp catering notice to [1..720] hours (30 days max — sanity cap,
    // protects the schedule picker against absurd inputs). Anything else
    // → undefined so Prisma skips the write.
    let cateringNoticeHoursClean: number | undefined;
    if (typeof cateringNoticeHours === "number" && Number.isFinite(cateringNoticeHours)) {
      const v = Math.floor(cateringNoticeHours);
      if (v >= 1 && v <= 720) cateringNoticeHoursClean = v;
    }

    // Reject saves that would disable EVERY customer-facing ordering
    // channel (audit 2026-05-30). Reservations are excluded from this
    // check because they're not a primary ordering channel — a
    // reservations-only restaurant is a valid model. The owner can
    // still pause briefly via the dashboard's temporary-close switch.
    const willHaveAtLeastOneOrderingChannel =
      !!(enabled?.pickup ?? true) // optimistic default — same as legacy create
      || !!enabled?.delivery
      || !!enabled?.dineIn
      || !!enabled?.catering
      || !!enabled?.takeOut;
    // Re-evaluate using the CURRENT DB state for the channels the
    // caller didn't send. We only block when the EFFECTIVE end state
    // would have everything off — partial updates that leave existing
    // enabled channels alone shouldn't trip the guard.
    if (enabled && Object.keys(enabled).length > 0) {
      const existing = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: {
          acceptsPickup: true, acceptsDelivery: true, acceptsDineIn: true,
          acceptsCatering: true, acceptsTakeOut: true,
        },
      });
      const effective = {
        pickup: enabled.pickup ?? existing?.acceptsPickup ?? false,
        delivery: enabled.delivery ?? existing?.acceptsDelivery ?? false,
        dineIn: enabled.dineIn ?? existing?.acceptsDineIn ?? false,
        catering: enabled.catering ?? existing?.acceptsCatering ?? false,
        takeOut: enabled.takeOut ?? existing?.acceptsTakeOut ?? false,
      };
      const anyOn = effective.pickup || effective.delivery || effective.dineIn
        || effective.catering || effective.takeOut;
      if (!anyOn) {
        return NextResponse.json(
          {
            error:
              "Refusing to save: at least one ordering channel (Pickup, Delivery, Dine-In, Catering, or Take Out) must stay enabled. Use the pause toggle on the dashboard to close briefly.",
            code: "all_channels_disabled",
          },
          { status: 400 },
        );
      }
    }
    // Suppress unused-var lint warning from the optimistic-default check
    // above; the actual guard is in the block we just executed.
    void willHaveAtLeastOneOrderingChannel;

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
        autoAcceptOrders:    typeof autoAcceptOrders === "boolean" ? autoAcceptOrders : undefined,
        cateringNoticeHours: cateringNoticeHoursClean,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
