import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { sendKitchenPush } from "@/lib/push";
import {
  SECOND_FIRE_DELAY_MS,
  SEGMENT_MS,
  arrivalSoundMayStillPlay,
  roundTwoFits,
  roundTwoSendDeadline,
} from "@/lib/ios-ring-timing";

/**
 * POST/GET /api/cron/ios-ring-pending  (Vercel cron, every minute)
 *
 * iOS CONTINUOUS ORDER RING — GloriaFood parity (Luigi 2026-07-05).
 *
 * Android's native alarm loops until a pending order is accepted or its
 * window expires. iOS has no equivalent: a closed app can't poll, and Apple
 * caps one notification sound at ~30s. So the SERVER re-fires the alert push
 * while the order sits pending — each push replaces the previous banner
 * (apns-collapse-id) and replays the full 29s order_alarm.caf, and each cron
 * invocation fires TWICE (t=0 and t≈29s, maxDuration below) so the ring is
 * effectively gapless minute after minute. The instant staff accept/reject
 * (or auto-reject flips the order), the next sweep finds nothing → silence.
 *
 * iOS ONLY by construction: we check the restaurant's ACTIVE device (the
 * single most-recent token — same rule sendKitchenPush targets) and skip
 * unless it's platform "ios". Android devices never receive these re-rings —
 * their native loop already covers it, and double-ringing is the #1 thing
 * Luigi said never to touch.
 *
 * Ring window mirrors the missed-order call cron: anchored on
 * alertAt ?? notifiedAt (the moment the order STARTED ringing — closed-placed
 * orders anchor on their deferred opening ring), for up to RING_WINDOW_MS.
 * After that the auto-reject/missed-call escalation has long taken over.
 * Pending non-deposit reservations ride along, same as order-alert-calls.
 *
 * Stateless + idempotent: repetition is the point; no stamps needed. A
 * duplicate sweep just replaces the same collapsed banner.
 *
 * Authorized callers: Vercel cron (Bearer CRON_SECRET) or a superadmin.
 */

// Ring for up to 10 minutes past the ring anchor. Auto-reject (*/5 cron) and
// the ~90s missed-order call both fire well inside this window.
const RING_WINDOW_MS = 10 * 60_000;
const MAX_ROWS = 300;
// Second fire inside the same invocation ≈ when the first sound finishes, so
// the ring is continuous across the whole minute. Scheduled relative to the
// INVOCATION START (fire at start+29s), NOT round-1 completion — a slow round 1
// (cold DB / slow FCM) used to push the second sound late enough to overlap the
// NEXT minute's t=0 fire, stacking two alarm segments (Fabrizio cmrkvs5r).
// The round-2 go/no-go rule itself (fa1328ad, relaxed 2026-07-19) lives in
// ios-ring-timing.ts roundTwoFits() with its full rationale + tests.

// ── Official 4-minute GloriaFood alarm, segmented (Luigi 2026-07-05) ────────
// The locked-in alarm ESCALATES (louder/faster toward the end), but Apple caps
// one notification sound at ~30s. So the 245s track is bundled as 9 × 29s
// segments (order_alarm_0..8.caf) and each re-ring plays the segment matching
// how long the OLDEST pending item has been ringing — a locked iPhone walks
// the whole ramp in order, then repeats the loud/fast finale until accepted.
// GATED on IOS_ALARM_SEGMENTS=1 (Vercel env): builds before the segments were
// bundled would play the DEFAULT iOS ding for a missing sound file — worse
// than looping the calm 29s opener. Flip the flag once the segmented build is
// installed on the kitchen devices.
const LAST_SEGMENT = 8;
function alarmSoundFor(oldestAnchorMs: number, nowMs: number): string {
  if (process.env.IOS_ALARM_SEGMENTS !== "1") return "order_alarm.caf";
  const seg = Math.min(Math.max(Math.floor((nowMs - oldestAnchorMs) / SEGMENT_MS), 0), LAST_SEGMENT);
  return `order_alarm_${seg}.caf`;
}

export const maxDuration = 55;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const invocationStart = Date.now();
  const first = await ringPendingOnce();
  // Nothing ringing AND nothing freshly-gated → don't hold the lambda open.
  // A round-1 that only GATED a just-arrived item (its arrival .caf still
  // playing — Fabrizio's double-ring, 2026-07-18) must still hold for round 2:
  // by t≈29s the arrival sound has finished and round 2 is exactly the
  // seamless hand-off from the arrival sound to the first re-ring.
  if (first.sent === 0 && first.gatedYoung === 0) {
    return NextResponse.json({ rounds: [first] });
  }

  // Anchor the second fire on the invocation START: wait only what's left of
  // the 29s segment after round 1's elapsed time — and unless round 2's
  // PROJECTED segment end fits inside the minute (+ the small bleed tolerance
  // documented in ios-ring-timing.ts), skip round 2 rather than stack alarms
  // over the next invocation's audio. The projection may only VETO when round
  // 1 actually started audio (sent > 0): on a pure young-gate hold, round 2 is
  // the item's ONLY ring this minute and there is no round-1 segment to stack
  // on — a slow round 1 must not cost the order its whole minute of ringing
  // (review, 2026-07-19). A genuinely late round 2 is still capped by the
  // send deadline passed below.
  const round1ElapsedMs = Date.now() - invocationStart;
  if (first.sent > 0 && !roundTwoFits(round1ElapsedMs)) {
    return NextResponse.json({ rounds: [first] });
  }
  await new Promise((r) => setTimeout(r, Math.max(0, SECOND_FIRE_DELAY_MS - round1ElapsedMs)));
  // Re-query so an order accepted during the delay goes silent immediately.
  const second = await ringPendingOnce(roundTwoSendDeadline(invocationStart));
  return NextResponse.json({ rounds: [first, second] });
}

export async function GET(req: NextRequest) {
  return POST(req);
}

async function ringPendingOnce(sendDeadlineMs?: number): Promise<{ restaurants: number; sent: number; skippedNonIos: number; gatedYoung: number }> {
  const now = Date.now();
  const floor = new Date(now - RING_WINDOW_MS);
  const nowDate = new Date(now);

  // Same anchor shape as order-alert-calls: alertAt (deferred opening ring for
  // closed-placed orders) else notifiedAt. alertAt in the future = parked until
  // opening — never ring overnight.
  const orders = await prisma.order.findMany({
    where: {
      status: "pending",
      notifiedAt: { not: null },
      OR: [
        { alertAt: { gte: floor, lte: nowDate } },
        { alertAt: null, notifiedAt: { gte: floor, lte: nowDate } },
      ],
    },
    select: { restaurantId: true, orderNumber: true, customerName: true, notifiedAt: true, alertAt: true, restaurant: { select: { name: true } } },
    orderBy: { notifiedAt: "desc" },
    take: MAX_ROWS,
  });

  // Pending non-deposit reservations ring too (same rule as the alert calls —
  // a deposit-awaiting booking is waiting on the CUSTOMER, not the kitchen).
  const reservations = await prisma.reservation.findMany({
    where: {
      status: "pending",
      AND: [
        {
          OR: [
            { alertAt: { gte: floor, lte: nowDate } },
            { alertAt: null, createdAt: { gte: floor, lte: nowDate } },
          ],
        },
        { OR: [{ depositAmount: { lte: 0 } }, { depositPaid: true }] },
      ],
    },
    select: { restaurantId: true, customerName: true, createdAt: true, alertAt: true, restaurant: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  // One push per restaurant per round — the alarm says "something is waiting",
  // the list in the app says what. oldestAnchorMs drives which ramp segment of
  // the 4-minute alarm plays (the longest-waiting item sets the urgency).
  const byRestaurant = new Map<string, { name: string; orderCount: number; resCount: number; newestOrder?: string; oldestAnchorMs: number }>();
  // NEVER re-ring an item whose ARRIVAL push sound may still be playing —
  // layering the re-ring's 29s alarm over the arrival's made one order sound
  // like two (Fabrizio's 2026-07-18 video: pushes 2.6s apart, both .cafs
  // overlapping). Deferred (alertAt) items are exempt — they had no arrival
  // push, the cron IS their first ring. Young items are tracked per
  // restaurant (not dropped): a restaurant that rings anyway for OLDER items
  // must still COUNT them in its banner, and a young-ONLY restaurant decides
  // whether the lambda holds for round 2 (checked against its device platform
  // below — holding for an Android-only restaurant would be pure waste).
  const youngByRestaurant = new Map<string, { orders: number; res: number }>();
  const noteYoung = (restaurantId: string, kind: "orders" | "res") => {
    const y = youngByRestaurant.get(restaurantId) ?? { orders: 0, res: 0 };
    y[kind]++;
    youngByRestaurant.set(restaurantId, y);
  };
  for (const o of orders) {
    if (arrivalSoundMayStillPlay(o.alertAt, o.notifiedAt, now)) {
      noteYoung(o.restaurantId, "orders");
      continue;
    }
    const anchor = (o.alertAt ?? o.notifiedAt)!.getTime();
    const e = byRestaurant.get(o.restaurantId) ?? { name: o.restaurant.name, orderCount: 0, resCount: 0, newestOrder: undefined as string | undefined, oldestAnchorMs: anchor };
    e.orderCount++;
    e.oldestAnchorMs = Math.min(e.oldestAnchorMs, anchor);
    if (!e.newestOrder) e.newestOrder = `#${o.orderNumber} · ${o.customerName}`;
    byRestaurant.set(o.restaurantId, e);
  }
  for (const b of reservations) {
    if (arrivalSoundMayStillPlay(b.alertAt, b.createdAt, now)) {
      noteYoung(b.restaurantId, "res");
      continue;
    }
    const anchor = (b.alertAt ?? b.createdAt).getTime();
    const e = byRestaurant.get(b.restaurantId) ?? { name: b.restaurant.name, orderCount: 0, resCount: 0, newestOrder: undefined as string | undefined, oldestAnchorMs: anchor };
    e.resCount++;
    e.oldestAnchorMs = Math.min(e.oldestAnchorMs, anchor);
    byRestaurant.set(b.restaurantId, e);
  }

  // Round 2's hard send cap (roundTwoSendDeadline): the fits-projection uses
  // round 1's elapsed as a latency proxy, but only the clock HERE knows round
  // 2's real lateness. Past the deadline, a bounded gap beats stacking audio
  // into the next minute's round 1.
  if (sendDeadlineMs !== undefined && Date.now() > sendDeadlineMs) {
    return { restaurants: byRestaurant.size, sent: 0, skippedNonIos: 0, gatedYoung: 0 };
  }

  let sent = 0;
  let skippedNonIos = 0;
  let gatedYoung = 0;
  await Promise.allSettled(
    Array.from(byRestaurant.entries()).map(async ([restaurantId, info]) => {
      // Active device = most recent token (identical rule to sendKitchenPush).
      // Only iOS gets re-rings; Android's native alarm already loops.
      const device = await prisma.kitchenPushToken.findFirst({
        where: { restaurantId },
        orderBy: { lastSeenAt: "desc" },
        select: { platform: true },
      });
      if (device?.platform !== "ios") {
        skippedNonIos++;
        return;
      }
      // Young items don't make a restaurant ring on their own, but when it
      // rings anyway they belong in the count — "1 waiting" on a 2-pending
      // lock screen was a lie (review, 2026-07-19).
      const young = youngByRestaurant.get(restaurantId);
      const total = info.orderCount + info.resCount + (young ? young.orders + young.res : 0);
      // Body stays order-data-shaped like the placement push; staff-facing
      // English-min by the same rule as staff email bodies.
      const body = total === 1 && info.newestOrder ? info.newestOrder : `${total} waiting to be accepted`;
      const res = await sendKitchenPush(
        restaurantId,
        {
          title: info.name || "Order waiting",
          body,
          // NOT "new_order": the JS handler still refreshes the list on any
          // push, but nothing order-specific is implied. autoAccept "false"
          // → full order_alarm.caf, never the short chirp.
          data: { type: "pending_reminder", autoAccept: "false" },
        },
        { collapseId: `ffo-pending-${restaurantId}`, iosSound: alarmSoundFor(info.oldestAnchorMs, now) },
      );
      sent += res.sent;
    }),
  );

  // Young-ONLY restaurants get no push this round (that IS the double-ring
  // fix) — but they decide whether POST holds the lambda for round 2, and
  // holding is pointless when the device can't receive iOS re-rings. One
  // bounded findFirst per young-only restaurant, only in minutes where an
  // order just arrived.
  await Promise.allSettled(
    Array.from(youngByRestaurant.keys())
      .filter((id) => !byRestaurant.has(id))
      .map(async (restaurantId) => {
        const device = await prisma.kitchenPushToken.findFirst({
          where: { restaurantId },
          orderBy: { lastSeenAt: "desc" },
          select: { platform: true },
        });
        if (device?.platform === "ios") gatedYoung++;
        else skippedNonIos++;
      }),
  );

  return { restaurants: byRestaurant.size, sent, skippedNonIos, gatedYoung };
}
