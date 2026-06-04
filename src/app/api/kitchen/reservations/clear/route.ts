/**
 * POST /api/kitchen/reservations/clear
 *
 * Kitchen "Clear" on the Reservations tab. Hides the given reservations from
 * the Reservations tab ONLY (sets clearedFromReservationsAt). They stay
 * visible in the In Progress tab (a pending booking still needs accept/
 * decline) and the All tab — same per-tab-independence model as orders.
 *
 * Body: { reservationIds: string[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, checkKitchenSessionFresh } from "@/lib/session";
import prisma from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser({ preferKitchen: true });
    const role = user?.role;
    if (!user || !["restaurant_admin", "kitchen_staff", "superadmin"].includes(role ?? "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const restaurantId = user.restaurantId;
    if (!restaurantId) {
      return NextResponse.json({ error: "no_restaurant" }, { status: 400 });
    }

    const freshness = await checkKitchenSessionFresh();
    if (freshness === "stale") {
      return NextResponse.json(
        { error: "session_superseded", code: "session_superseded" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({} as any));
    const reservationIds: string[] = Array.isArray(body?.reservationIds)
      ? body.reservationIds.filter((x: unknown) => typeof x === "string").slice(0, 1000)
      : [];
    if (reservationIds.length === 0) {
      return NextResponse.json({ ok: true, cleared: 0 });
    }

    const res = await prisma.reservation.updateMany({
      where: { restaurantId, id: { in: reservationIds } },
      data: { clearedFromReservationsAt: new Date() },
    });

    return NextResponse.json({ ok: true, cleared: res.count });
  } catch (err: any) {
    console.error("[kitchen/reservations/clear POST]", err);
    return NextResponse.json({ error: err.message ?? "clear_failed" }, { status: 500 });
  }
}
