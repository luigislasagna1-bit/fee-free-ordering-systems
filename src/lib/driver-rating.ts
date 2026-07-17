/**
 * Driver performance rating (Luigi 2026-07-15).
 *
 * One blended 0–100% score per driver, starting at 100% for a brand-new driver
 * and moving with three components:
 *   • reliability — completed vs cancelled ("can't complete") deliveries  (40%)
 *   • on-time     — delivered by the promised time                        (30%)
 *   • feedback    — average of restaurant / platform / customer stars     (30%)
 *
 * Each component gracefully defaults to a perfect 1.0 while there's no data for
 * it yet, so a new driver sits at 100% and only moves once real events land.
 * The score is DENORMALIZED onto Driver.ratingPct by recomputeDriverRating() on
 * every delivered / cancelled / feedback event, so all read surfaces (superadmin
 * list, driver app, dispatch view, customer tracking) read one cheap number.
 *
 * NOTE: an "acceptance rate" component folds in naturally once directed dispatch
 * (offer→accept/decline) exists; today the pool is pull-based so there's no
 * decline signal to measure. Weights below leave room for it.
 */

export const RATING_WEIGHTS = { reliability: 0.4, onTime: 0.3, feedback: 0.3 } as const;

/**
 * Smoothing prior: treat every driver as if they start with SMOOTHING_PRIOR
 * clean, on-time deliveries already banked. This keeps a tiny sample from
 * swinging the score wildly (without it, one cancellation on a driver's first
 * job would crater them to 60%). The more real history accrues, the less the
 * prior matters — a persistently poor driver still trends down.
 */
export const SMOOTHING_PRIOR = 4;

export type DriverRatingStats = {
  deliveredCount: number;
  cancelledCount: number;
  /** Deliveries completed after their promised time (subset of deliveredCount). */
  lateCount: number;
  /** Average star rating (1–5) across all feedback, or null/0 when none yet. */
  feedbackAvgStars: number | null;
  feedbackCount: number;
};

/**
 * The three component scores (each 0–1) that blend into ratingPct — extracted
 * (v1.1 Phase 3) so the math has ONE home: computeRatingPct derives from this,
 * and the driver-app Profile tab renders the same components as bars. Never
 * duplicate these formulas at a call site.
 */
export function ratingComponents(s: DriverRatingStats): {
  reliability: number;
  onTime: number;
  feedback: number;
} {
  const K = SMOOTHING_PRIOR;
  const reliability = (s.deliveredCount + K) / (s.deliveredCount + s.cancelledCount + K);
  const onTimeDeliveries = Math.max(0, s.deliveredCount - s.lateCount);
  const onTime = (onTimeDeliveries + K) / (s.deliveredCount + K);
  const feedback = s.feedbackCount > 0 && s.feedbackAvgStars != null ? s.feedbackAvgStars / 5 : 1;
  return { reliability, onTime, feedback };
}

/**
 * Blended 0–100 score. Reliability + on-time carry a smoothing prior (see
 * SMOOTHING_PRIOR) so a new driver sits at 100% and single events nudge rather
 * than lurch the score. Feedback defaults to a perfect 1.0 until any star rating
 * lands.
 */
export function computeRatingPct(s: DriverRatingStats): number {
  const c = ratingComponents(s);

  const blended =
    RATING_WEIGHTS.reliability * c.reliability +
    RATING_WEIGHTS.onTime * c.onTime +
    RATING_WEIGHTS.feedback * c.feedback;

  // Clamp + round to a whole percent. Never below 0 or above 100.
  return Math.max(0, Math.min(100, Math.round(blended * 100)));
}

/**
 * Recompute a driver's ratingPct (and keep ratingAvg/ratingCount in sync with
 * the feedback rows) from current counters + feedback. Idempotent; call after
 * any event that changes the inputs. Takes a Prisma-like client so it works
 * inside a transaction too.
 */
export async function recomputeDriverRating(
  db: {
    driver: { findUnique: (a: any) => Promise<any>; update: (a: any) => Promise<any> };
    driverFeedback: { aggregate: (a: any) => Promise<any> };
  },
  driverId: string,
): Promise<number | null> {
  const driver = await db.driver.findUnique({
    where: { id: driverId },
    select: { deliveredCount: true, cancelledCount: true, lateCount: true },
  });
  if (!driver) return null;

  const agg = await db.driverFeedback.aggregate({
    where: { driverId },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const feedbackAvgStars = agg._avg.stars ?? null;
  const feedbackCount = agg._count._all ?? 0;

  const ratingPct = computeRatingPct({
    deliveredCount: driver.deliveredCount,
    cancelledCount: driver.cancelledCount,
    lateCount: driver.lateCount,
    feedbackAvgStars,
    feedbackCount,
  });

  await db.driver.update({
    where: { id: driverId },
    data: {
      ratingPct,
      ratingAvg: feedbackAvgStars,
      ratingCount: feedbackCount,
    },
  });
  return ratingPct;
}
