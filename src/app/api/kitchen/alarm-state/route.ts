/**
 * GET /api/kitchen/alarm-state?token=<fcmToken>
 *
 * Lightweight poll used by the native keep-alive service to decide whether the
 * tablet should be RINGING right now. Token-authenticated (the device's
 * registered push token maps to its restaurant) — no session needed, since the
 * background service has no cookie. Returns { ringing } where ringing = there is
 * at least one PENDING order or reservation currently inside its accept window
 * (so the alarm rings continuously until the order is accepted — status leaves
 * "pending" — or the window expires; it then stops on the next poll). Luigi
 * 2026-06-16.
 *
 * SCALE NOTE: polled ~every 4s per device. The queries are restaurant-scoped +
 * indexed (small pending set). At high device counts, cache the per-restaurant
 * "ringing" result for ~2s (Redis / in-memory) so a burst of device polls for
 * one restaurant collapses to one DB read.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

const ORDER_WINDOW_MS = 4 * 60 * 1000; // matches the kitchen accept countdown
const CLOSED_WINDOW_MS = 15 * 60 * 1000; // placed-while-closed gets the longer window

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ ringing: false });

  const device = await prisma.kitchenPushToken.findUnique({
    where: { token },
    select: { restaurantId: true },
  });
  if (!device) return NextResponse.json({ ringing: false });

  const now = Date.now();
  const restaurantId = device.restaurantId;

  // Orders: pending + released (notifiedAt set), past their ring anchor
  // (alertAt ?? notifiedAt) but still inside the accept window.
  const orders = await prisma.order.findMany({
    where: { restaurantId, status: "pending", notifiedAt: { not: null } },
    select: { notifiedAt: true, alertAt: true, placedWhileClosed: true },
    take: 30,
  });
  let ringing = orders.some((o) => {
    const anchor = o.alertAt ? o.alertAt.getTime() : (o.notifiedAt ? o.notifiedAt.getTime() : 0);
    if (anchor > now) return false; // parked / not started ringing yet
    const window = o.placedWhileClosed ? CLOSED_WINDOW_MS : ORDER_WINDOW_MS;
    return now - anchor < window;
  });

  // Reservations: pending, no deposit owed, inside the same window.
  if (!ringing) {
    const resv = await prisma.reservation.findMany({
      where: { restaurantId, status: "pending", depositAmount: { lte: 0 } },
      select: { createdAt: true, alertAt: true },
      take: 30,
    });
    ringing = resv.some((r) => {
      const anchor = r.alertAt ? r.alertAt.getTime() : r.createdAt.getTime();
      if (anchor > now) return false;
      const window = r.alertAt ? CLOSED_WINDOW_MS : ORDER_WINDOW_MS;
      return now - anchor < window;
    });
  }

  return NextResponse.json({ ringing });
}
