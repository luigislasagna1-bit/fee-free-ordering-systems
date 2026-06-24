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
import { withDbRetry, isTransient } from "@/lib/db-retry";

const ORDER_WINDOW_MS = 4 * 60 * 1000; // matches the kitchen accept countdown
const CLOSED_WINDOW_MS = 15 * 60 * 1000; // placed-while-closed gets the longer window
// Window for treating a just-released auto-accepted order as "newly arrived": its id is
// returned in `autoRing` for this long after release so the native app plays ONE short
// FYI ring (the app dedups so it rings once, not every poll). 8s comfortably spans a ~4s
// poll gap. Auto-accepts deliberately DON'T set the pending `ringing` flag anymore — that
// blasted the full urgent alarm for ~30s on an already-handled order (K3). See below.
// Luigi 2026-06-23.
const AUTO_ACCEPT_RING_MS = 8 * 1000;
// Native background-print discovery window — only orders RELEASED in this window
// are offered for background printing, so a fresh deploy (kitchenPrintedAt is null
// on all history) never reprints old tickets. Luigi 2026-06-22.
const PRINT_LOOKBACK_MS = 15 * 60 * 1000;

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ ringing: false });

  try {
    const device = await withDbRetry(() =>
      prisma.kitchenPushToken.findUnique({
        where: { token },
        select: { restaurantId: true },
      }),
    );
    if (!device) return NextResponse.json({ ringing: false });

    const now = Date.now();
    const restaurantId = device.restaurantId;

    // Orders: pending + released (notifiedAt set), past their ring anchor
    // (alertAt ?? notifiedAt) but still inside the accept window.
    const orders = await withDbRetry(() =>
      prisma.order.findMany({
        where: { restaurantId, status: "pending", notifiedAt: { not: null } },
        select: { notifiedAt: true, alertAt: true, placedWhileClosed: true },
        take: 30,
      }),
    );
    let ringing = false;
    let hasExpired = false; // pending but PAST its accept window → should be missed
    for (const o of orders) {
      const anchor = o.alertAt ? o.alertAt.getTime() : (o.notifiedAt ? o.notifiedAt.getTime() : 0);
      if (anchor > now) continue; // parked / not started ringing yet
      const window = o.placedWhileClosed ? CLOSED_WINDOW_MS : ORDER_WINDOW_MS;
      if (now - anchor < window) ringing = true;
      else hasExpired = true;
    }

    // Auto-accepted orders are created status "accepted" (they skip "pending"), so the
    // pending query above misses them. We DON'T fold them into `ringing` anymore — that
    // played the full urgent alarm for ~30s on an order that's already handled (K3,
    // Luigi 2026-06-23). Instead we return their ids in `autoRing` so the v2.7 native
    // engine plays ONE short ~3s FYI ring per order (deduped client-side, so it rings
    // once — not every poll). A JUST-released auto-accept is one whose release anchor
    // (alertAt ?? notifiedAt, per the scheduled-order ring-timing rule) is within the
    // last 8s; a NORMAL manual accept lands minutes after placement, so its anchor is far
    // past 8s and never appears here. Gated on no pending ring: when the full alarm is
    // already going, an auto FYI is redundant. (A v2.6 app ignores `autoRing`: its
    // FCM-started alarm is stopped by the next ~4s poll since `ringing` is false → ~4s
    // instead of 30s WHEN the FCM delivers. If the FCM is dropped on a backgrounded v2.6
    // device it no longer rings the auto-accept at all — acceptable, the order is already
    // accepted + printed; v2.7 restores a reliable poll-driven FYI via autoRing.)
    const autoRing: string[] = [];
    if (!ringing) {
      const since = new Date(now - AUTO_ACCEPT_RING_MS);
      const autoAccepted = await withDbRetry(() =>
        prisma.order.findMany({
          where: {
            restaurantId,
            status: "accepted",
            OR: [
              { notifiedAt: { gte: since } },
              { alertAt: { gte: since, lte: new Date(now) } },
            ],
          },
          select: { id: true, notifiedAt: true, alertAt: true },
          take: 30,
        }),
      );
      for (const o of autoAccepted) {
        if (!o.notifiedAt) continue;
        const notified = o.notifiedAt.getTime();
        const anchor = o.alertAt ? o.alertAt.getTime() : notified;
        if (anchor > now) continue; // parked / not started ringing yet
        if (now - anchor < AUTO_ACCEPT_RING_MS) autoRing.push(o.id);
      }
    }

    // Reservations: pending, no deposit owed.
    const resv = await withDbRetry(() =>
      prisma.reservation.findMany({
        where: { restaurantId, status: "pending", depositAmount: { lte: 0 } },
        select: { createdAt: true, alertAt: true },
        take: 30,
      }),
    );
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

    // Per-restaurant alarm preference (ring + vibrate vs ring only). Only read it
    // when we're actually about to ring — keeps the common "nothing pending" poll a
    // single-purpose ringing check with no extra query. The native keep-alive poll
    // reads `vibrate` and passes it to OrderAlarmService. Luigi 2026-06-16.
    let vibrate = true;
    if (ringing || autoRing.length > 0) {
      const r = await withDbRetry(() =>
        prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { kitchenVibrate: true },
        }),
      );
      vibrate = r?.kitchenVibrate !== false;
    }

    // Orders the native BACKGROUND-print service (KitchenKeepAliveService, runs
    // while the app is closed) should print: accepted + released + not yet
    // printed, recent enough that a fresh deploy can't reprint history. The
    // service claims each via /api/kitchen/print-job-token (atomic), so this is
    // just a discovery hint — duplicate ids across polls are harmless. Luigi
    // 2026-06-22.
    const toPrint = await withDbRetry(() =>
      prisma.order.findMany({
        where: {
          restaurantId,
          status: "accepted",
          kitchenPrintedAt: null,
          notifiedAt: { gte: new Date(now - PRINT_LOOKBACK_MS) },
        },
        select: { id: true },
        orderBy: { notifiedAt: "asc" },
        take: 10,
      }),
    );

    return NextResponse.json({ ringing, vibrate, print: toPrint.map((o) => o.id), autoRing });
  } catch (err) {
    // A transient DB connection drop (Neon recycles pooled connections, so the
    // ~4s poll occasionally hits a just-closed one) must NOT 500 the kitchen poll
    // or spam Sentry. Return a safe "not ringing" for this cycle — the next poll
    // re-evaluates ~4s later, and every query here is an idempotent read, so
    // nothing is lost. Non-transient errors are re-thrown so genuine bugs still
    // surface in Sentry. Luigi 2026-06-18.
    if (isTransient(err)) {
      console.warn("[alarm-state] transient DB error, returning ringing:false:", err instanceof Error ? err.message : err);
      return NextResponse.json({ ringing: false });
    }
    throw err;
  }
}
