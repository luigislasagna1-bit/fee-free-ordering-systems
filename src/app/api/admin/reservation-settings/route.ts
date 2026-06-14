import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const user = await getSessionUser();
    const restaurantId = user?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let settings = await prisma.reservationSettings.findUnique({ where: { restaurantId } });
    if (!settings) {
      settings = await prisma.reservationSettings.create({ data: { restaurantId } });
    }
    return NextResponse.json(settings);
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
    const {
      minNoticeHours, minNoticeMinutes, maxAdvanceDays, slotLengthMinutes,
      maxPerSlot, minGuests, maxGuests, autoConfirm, allowPreOrder, holdMinutes,
      requireDeposit, depositAmount,
      cancellationPolicy, reservationHours, blackoutDates,
    } = body;

    // Reservation deposits are a paid add-on (take_reservation_deposit). Block
    // turning them ON without it — locked until subscribed (currently comingSoon,
    // so locked for everyone). Luigi 2026-06-14.
    if (requireDeposit === true && !(await hasFeature(restaurantId, "take_reservation_deposit"))) {
      return NextResponse.json(
        { error: "Reservation deposits require the Reservation Deposits add-on.", code: "feature_locked", feature: "take_reservation_deposit" },
        { status: 403 },
      );
    }

    const settings = await prisma.reservationSettings.upsert({
      where: { restaurantId },
      update: {
        ...(minNoticeHours     !== undefined && { minNoticeHours:     parseInt(minNoticeHours) }),
        ...(minNoticeMinutes   !== undefined && { minNoticeMinutes:   parseInt(minNoticeMinutes) }),
        ...(maxAdvanceDays     !== undefined && { maxAdvanceDays:     parseInt(maxAdvanceDays) }),
        ...(slotLengthMinutes  !== undefined && { slotLengthMinutes:  parseInt(slotLengthMinutes) }),
        ...(maxPerSlot         !== undefined && { maxPerSlot:         parseInt(maxPerSlot) }),
        ...(minGuests          !== undefined && { minGuests:          parseInt(minGuests) }),
        ...(maxGuests          !== undefined && { maxGuests:          parseInt(maxGuests) }),
        ...(autoConfirm        !== undefined && { autoConfirm }),
        ...(allowPreOrder      !== undefined && { allowPreOrder }),
        ...(holdMinutes        !== undefined && { holdMinutes:        parseInt(holdMinutes) }),
        ...(requireDeposit     !== undefined && { requireDeposit }),
        ...(depositAmount      !== undefined && { depositAmount:      parseFloat(depositAmount) }),
        ...(cancellationPolicy !== undefined && { cancellationPolicy }),
        ...(reservationHours   !== undefined && { reservationHours:   JSON.stringify(reservationHours) }),
        ...(blackoutDates      !== undefined && { blackoutDates:      JSON.stringify(blackoutDates) }),
      },
      create: { restaurantId },
    });

    return NextResponse.json(settings);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
