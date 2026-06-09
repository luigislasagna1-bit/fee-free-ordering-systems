/**
 * POST /api/kitchen/reservations/clear
 *
 * Kitchen "Clear" for a booking, PER TAB — same independent per-tab model as
 * orders. A walk-up booking appears in the All, Complete and Reservations tabs,
 * each with its own clear flag, so clearing one tab never empties another and
 * the booking itself is never deleted.
 *
 * Body: { reservationIds: string[], tab?: "all" | "complete" | "reservations" }
 *   "reservations" (default) → clearedFromReservationsAt
 *   "all"                    → clearedFromAllAt
 *   "complete"               → clearedFromCompleteAt
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

    // Which tab is clearing? Each maps to its own flag so the booking only
    // disappears from THAT tab. Default = Reservations tab (back-compat).
    const tab = body?.tab === "all" ? "all" : body?.tab === "complete" ? "complete" : "reservations";
    const data =
      tab === "all"      ? { clearedFromAllAt: new Date() } :
      tab === "complete" ? { clearedFromCompleteAt: new Date() } :
                           { clearedFromReservationsAt: new Date() };

    const res = await prisma.reservation.updateMany({
      where: {
        restaurantId,
        id: { in: reservationIds },
        // Never silently hide a still-pending booking from the All tab — it
        // needs an explicit accept/decline first, exactly like a pending order.
        ...(tab === "all" ? { status: { not: "pending" } } : {}),
      },
      data,
    });

    return NextResponse.json({ ok: true, cleared: res.count });
  } catch (err: any) {
    console.error("[kitchen/reservations/clear POST]", err);
    return NextResponse.json({ error: err.message ?? "clear_failed" }, { status: 500 });
  }
}
