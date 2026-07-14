/**
 * Best-driver ranking for directed Fee Free Delivery dispatch (Luigi 2026-07-14).
 *
 * When a restaurant assigns a delivery, the system offers it to the driver that
 * "makes the most sense". That judgement is a WEIGHTED SUM of independent
 * criteria, each normalized to 0..1 (higher = better). New behavior signals
 * (on-time %, acceptance rate, cancellations, customer ratings, …) drop in as
 * one more entry in CRITERIA — nothing else changes. Start simple, grow it as we
 * track drivers.
 *
 * This module is PURE (no DB): the caller gathers the candidate stats (online
 * drivers + their distance/load/rating/history) and passes them in, so the
 * ranking is trivially unit-testable and the data-gathering stays separate.
 */

/** A dispatch-eligible (online) driver plus the signals we rank on. Extend this
 *  as we track more driver behavior — add the field here + a CRITERION below. */
export interface DriverCandidate {
  driverId: string;
  name: string;
  /** Straight-line km from the driver's last-known GPS to the restaurant.
   *  null = no fresh location → treated as worst-case for distance. */
  distanceKm: number | null;
  /** Deliveries currently in progress for this driver (least-busy wins). */
  activeJobs: number;
  /** 0..5 average customer/restaurant rating, or null if unrated yet. */
  ratingAvg: number | null;
  ratingCount: number;
  /** Completed deliveries this driver has done FOR THIS restaurant (familiarity
   *  with the kitchen, the packing, the regulars). */
  restaurantDeliveries: number;
}

export interface DispatchWeights {
  distance: number;
  load: number;
  rating: number;
  history: number;
}

/** Default weights — distance dominates (a courier far away is a slow delivery),
 *  then load-balancing, then rating + familiarity. Tunable per platform later. */
export const DEFAULT_WEIGHTS: DispatchWeights = { distance: 0.45, load: 0.25, rating: 0.15, history: 0.15 };

/** How far out we still consider "close enough" — beyond this, distance score
 *  bottoms out (a 25km courier is no better than a 15km one: both are bad). */
const DISTANCE_SATURATE_KM = 15;
/** Load past this many active jobs is "fully loaded" (score 0). */
const LOAD_SATURATE = 5;
/** Restaurant-history saturates here — 20 prior deliveries ≈ "regular". */
const HISTORY_SATURATE = 20;
/** Neutral rating for an unrated driver — don't punish a brand-new driver, but
 *  don't rank them above a proven 5-star one either. */
const UNRATED_SCORE = 0.6;

/** One ranking signal → a 0..1 sub-score (higher = better). Adding a criterion
 *  is: add its field to DriverCandidate + a weight + one entry here. */
type Criterion = { key: keyof DispatchWeights; score: (c: DriverCandidate) => number };
const CRITERIA: Criterion[] = [
  { key: "distance", score: (c) => (c.distanceKm == null ? 0 : 1 - Math.min(Math.max(c.distanceKm, 0), DISTANCE_SATURATE_KM) / DISTANCE_SATURATE_KM) },
  { key: "load", score: (c) => 1 - Math.min(Math.max(c.activeJobs, 0), LOAD_SATURATE) / LOAD_SATURATE },
  { key: "rating", score: (c) => (c.ratingCount > 0 && c.ratingAvg != null ? Math.min(Math.max(c.ratingAvg, 0), 5) / 5 : UNRATED_SCORE) },
  { key: "history", score: (c) => Math.min(Math.max(c.restaurantDeliveries, 0), HISTORY_SATURATE) / HISTORY_SATURATE },
];

/** Weighted 0..1 fit score for one driver. */
export function scoreDriver(c: DriverCandidate, weights: DispatchWeights = DEFAULT_WEIGHTS): number {
  let total = 0;
  for (const crit of CRITERIA) total += (weights[crit.key] ?? 0) * crit.score(c);
  return total;
}

export type RankedDriver = DriverCandidate & { score: number };

/** Rank candidates best-first. Ties break by nearest, then least-busy, then
 *  higher rating, so the order is deterministic. */
export function rankDrivers(candidates: DriverCandidate[], weights: DispatchWeights = DEFAULT_WEIGHTS): RankedDriver[] {
  return candidates
    .map((c) => ({ ...c, score: scoreDriver(c, weights) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) ||
        a.activeJobs - b.activeJobs ||
        (b.ratingAvg ?? 0) - (a.ratingAvg ?? 0),
    );
}

/** The single best driver to offer first, or null if none are eligible. */
export function pickBestDriver(candidates: DriverCandidate[], weights?: DispatchWeights): RankedDriver | null {
  return rankDrivers(candidates, weights)[0] ?? null;
}

/** Best driver EXCLUDING those who already declined/were-offered this order —
 *  the re-offer step when the top pick declines or times out. */
export function pickNextDriver(
  candidates: DriverCandidate[],
  excludeDriverIds: Iterable<string>,
  weights?: DispatchWeights,
): RankedDriver | null {
  const exclude = new Set(excludeDriverIds);
  return pickBestDriver(candidates.filter((c) => !exclude.has(c.driverId)), weights);
}
