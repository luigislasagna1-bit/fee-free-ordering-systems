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
import { NextRequest, NextResponse, after } from "next/server";
import prisma from "@/lib/db";
import { autoRejectStaleOrders, autoRejectStaleReservations } from "@/lib/auto-reject-orders";

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
  let ringing = false;
  let hasExpired = false; // pending but PAST its accept window → should be missed
  for (const o of orders) {
    const anchor = o.alertAt ? o.alertAt.getTime() : (o.notifiedAt ? o.notifiedAt.getTime() : 0);
    if (anchor > now) continue; // parked / not started ringing yet
    const window = o.placedWhileClosed ? CLOSED_WINDOW_MS : ORDER_WINDOW_MS;
    if (now - anchor < window) ringing = true;
    else hasExpired = true;
  }

  // Reservations: pending, no deposit owed.
  const resv = await prisma.reservation.findMany({
    where: { restaurantId, status: "pending", depositAmount: { lte: 0 } },
    select: { createdAt: true, alertAt: true },
    take: 30,
  });
  for (const r of resv) {
    const anchor = r.alertAt ? r.alertAt.getTime() : r.createdAt.getTime();
    if (anchor > now) continue;
    const window = r.alertAt ? CLOSED_WINDOW_MS : ORDER_WINDOW_MS;
    if (now - anchor < window) ringing = true;
    else hasExpired = true;
  }

  // The INSTANT an order/reservation's accept window expires, mark it MISSED
  // (auto-decline + customer email + refund) — don't wait for the app to reopen
  // or the 5-min backstop cron. The device polls every ~4s, so this fires within
  // a few seconds of expiry. Scoped to this restaurant; runs AFTER the response
  // so the poll stays fast; the rejects are claim-based + idempotent so two
  // devices polling can't double-reject. Luigi 2026-06-16.
  if (hasExpired) {
    after(async () => {
      try { await autoRejectStaleOrders({ restaurantId }); } catch (e) { console.error("[alarm-state] order auto-reject", e); }
      try { await autoRejectStaleReservations({ restaurantId }); } catch (e) { console.error("[alarm-state] reservation auto-reject", e); }
    });
  }

  return NextResponse.json({ ringing });
}
