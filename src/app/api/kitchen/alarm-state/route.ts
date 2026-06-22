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
// Auto-accepted orders skip the "pending" state, so the pending query below never
// rings them — they relied solely on the (flaky) FCM push. We ring them via this
// reliable keep-alive poll for one short window: ~4s poll + 5s alarm + the alarm's
// isRunning guard ⇒ exactly one ~5s ring. Luigi 2026-06-21.
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

    // Auto-accepted orders ring ONCE on arrival too. They're created status:
    // "accepted" (they skip "pending"), so the query above misses them — leaving
    // only the flaky FCM push (rang in Test 1, silent in Test 2). Count a JUST-
    // released auto-accepted order as ringing for one short window; the device's
    // ~4s keep-alive poll + the 5s native alarm + its isRunning guard turn that
    // into exactly one ~5s ring, independent of FCM. A LATER manual accept
    // (acceptedAt well after notifiedAt) is excluded so accepting never re-rings.
    // Anchor on alertAt ?? notifiedAt per the scheduled-order ring-timing rule.
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
          select: { notifiedAt: true, acceptedAt: true, alertAt: true },
          take: 30,
        }),
      );
      for (const o of autoAccepted) {
        if (!o.notifiedAt) continue;
        const notified = o.notifiedAt.getTime();
        const accepted = o.acceptedAt ? o.acceptedAt.getTime() : 0;
        if (!accepted || accepted - notified > 3000) continue; // later manual accept → skip
        const anchor = o.alertAt ? o.alertAt.getTime() : notified;
        if (anchor > now) continue; // parked / not started ringing yet
        if (now - anchor < AUTO_ACCEPT_RING_MS) { ringing = true; break; }
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
    if (ringing) {
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

    return NextResponse.json({ ringing, vibrate, print: toPrint.map((o) => o.id) });
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
