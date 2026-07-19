/**
 * iOS kitchen ring — shared timing decisions for /api/cron/ios-ring-pending.
 *
 * Pure + prisma-free so the two rules below are unit-testable. Both exist
 * because of Fabrizio's 2026-07-18 iPhone video (report cmrkvs5r1):
 *
 *  (1) A single new order rang DOUBLE — the arrival push and the cron's first
 *      re-ring landed ~2.6s apart, and iOS happily overlaid both 29s
 *      order_alarm.caf plays ("as if two orders had arrived together").
 *      There was no minimum-age gate: an order whose notifiedAt was seconds
 *      old was immediately re-ring eligible.
 *
 *  (2) With one order left pending, the phone alternated ~29s of ringing with
 *      ~31s of silence — the cron's round-2 fire was skipped whenever round 1
 *      took >2s (routine on serverless cold starts), so slow minutes played
 *      only one 29s segment out of 60s.
 */

// order_alarm.caf (and each ramp segment order_alarm_0..7.caf) is 29.00s of
// 22050 Hz mono LPCM — just under Apple's ~30s notification-sound cap.
export const ARRIVAL_SOUND_MS = 29_000;

// How much earlier than the arrival sound's END a re-ring may be SENT: the
// push spends ~1-2s in FCM→APNs→delivery, so a send at (arrival + 27s) starts
// playing device-side right as the arrival sound finishes. Overlap is bounded
// to ~1s of the same bell pattern instead of a full doubled alarm, and the
// alternative (gating a full 29s) would open a fresh 30s silence hole for
// orders that arrive late in a cron minute.
export const APNS_DELIVERY_SLACK_MS = 2_000;
export const FIRST_RERING_GRACE_MS = ARRIVAL_SOUND_MS - APNS_DELIVERY_SLACK_MS;

// One re-ring audio segment (same 29s .caf family as the arrival sound).
export const SEGMENT_MS = 29_000;
// Round 2 fires at invocationStart + 29s so its audio starts as round 1's ends.
export const SECOND_FIRE_DELAY_MS = 29_000;
export const MINUTE_MS = 60_000;

// How far past the minute boundary round 2's PROJECTED audio end may bleed.
// fa1328ad's original bound (0ms tolerance → round 1 must finish in ≤2s)
// preferred a gap over any overlap — but on serverless a 2s round 1 is the
// EXCEPTION, so most minutes degraded to 29s-ring/31s-silence (Fabrizio's
// "stopped ringing, only to resume shortly after"). The projection also
// double-counts latency: it prices round 2's own latency at round 1's full
// elapsed time (cold start included) even though round 2 runs warm, and the
// NEXT minute's round 1 pays its own 1-2s latency before its audio starts.
// Worst realistic case is ~2-3s of same-bell overlap at the minute boundary
// (review, 2026-07-19) — accepted in exchange for closing the 31s hole; the
// roundTwoSendDeadline check below hard-caps it even when round 2's own
// latency blows past the round-1 proxy.
export const ROUND2_BLEED_TOLERANCE_MS = 3_000;

/**
 * Hard wall-clock cap on WHEN round 2 may actually hand pushes to FCM: the
 * roundTwoFits projection prices round 2's latency with round 1's elapsed
 * time as a proxy, but the real latency isn't knowable until after round 2's
 * own DB queries. If the clock has slipped past this deadline by send time,
 * round 2 drops its sends (a bounded gap — the old failure mode — instead of
 * stacking audio well into the next minute's round 1).
 */
export function roundTwoSendDeadline(invocationStartMs: number): number {
  return invocationStartMs + SECOND_FIRE_DELAY_MS + ROUND2_BLEED_TOLERANCE_MS;
}

/**
 * True when this pending item's ARRIVAL push sound may still be playing on
 * the device — re-ringing now would layer a second alarm on top of it.
 *
 * Applies ONLY to items that actually had an arrival push: a closed-placed
 * order (alertAt set) defers its arrival push entirely — the cron IS its
 * first ring — so gating it would just delay the opening ring by a minute.
 * `arrivalAt` = Order.notifiedAt / Reservation.createdAt (both stamped at the
 * moment the arrival push actually fired).
 */
export function arrivalSoundMayStillPlay(
  alertAt: Date | null,
  arrivalAt: Date | null,
  nowMs: number,
): boolean {
  if (alertAt) return false;
  if (!arrivalAt) return false;
  return nowMs - arrivalAt.getTime() < FIRST_RERING_GRACE_MS;
}

/**
 * Whether the cron invocation should hold the lambda open and fire round 2 at
 * invocationStart + SECOND_FIRE_DELAY_MS. Round 2's own latency can't be
 * measured before deciding, so round 1's elapsed time is the proxy (same
 * cold-DB / slow-FCM conditions).
 */
export function roundTwoFits(round1ElapsedMs: number): boolean {
  return (
    SECOND_FIRE_DELAY_MS + round1ElapsedMs + SEGMENT_MS <=
    MINUTE_MS + ROUND2_BLEED_TOLERANCE_MS
  );
}
