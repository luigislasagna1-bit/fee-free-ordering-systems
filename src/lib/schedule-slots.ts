/**
 * Scheduled-order slot generation for ONE calendar date (Luigi 2026-07-04).
 *
 * Correct model for restaurants that close past midnight: calendar date D
 * offers
 *   1. the early-morning SPILL of D−1's overnight window(s) (00:00 → spill
 *      end), and
 *   2. D's own windows CLIPPED at midnight (their post-midnight remainder
 *      belongs to D+1's list).
 *
 * The previous inline implementation wrapped an overnight window's
 * post-midnight part back onto the SAME date via `% 24`, which offered
 * early-morning times that belonged to the NEXT night's service and let
 * them bypass the "now + prep" floor — customers saw already-past times
 * like 1:15 AM at 1:50 AM. Every slot returned here is a genuine minute of
 * the requested date, so the floor applies uniformly and nothing invalid
 * is ever offered.
 *
 * Pure + client-safe. Times are "HH:MM" wall-clock in the restaurant's tz.
 */
export type HoursInterval = { open: string; close: string; closesNextDay?: boolean };

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const toHHMM = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function buildDaySlots(args: {
  /** The date's own opening windows (from its weekly row / special day). */
  dayIntervals: HoursInterval[];
  /** The PREVIOUS day's windows — only their overnight spill is used. */
  prevDayIntervals: HoursInterval[];
  /** Slot cadence in minutes (already clamped by the caller). */
  stepMinutes: number;
  /** Earliest offerable minute of the date (now + prep for today; 0 else). */
  minMinutes?: number;
}): string[] {
  const step = Math.max(5, Math.min(120, args.stepMinutes || 15));
  const minMin = Math.max(0, args.minMinutes ?? 0);
  const out: string[] = [];
  const push = (m: number) => {
    if (m < minMin || m >= 24 * 60) return;
    out.push(toHHMM(m));
  };

  // 1. Spill from yesterday's overnight window(s): 00:00 → spill end.
  for (const iv of args.prevDayIntervals) {
    const start = toMin(iv.open);
    const closeRaw = toMin(iv.close);
    const overnight = Boolean(iv.closesNextDay) || closeRaw <= start;
    if (!overnight) continue;
    for (let m = 0; m <= closeRaw - step; m += step) push(m);
  }

  // 2. The date's own windows, clipped at midnight.
  for (const iv of args.dayIntervals) {
    const start = toMin(iv.open);
    let end = toMin(iv.close);
    if (Boolean(iv.closesNextDay) || end <= start) end = 24 * 60;
    for (let m = start; m <= end - step; m += step) push(m);
  }

  // Dedup preserving order (overlapping windows are rare but harmless).
  return out.filter((s, i) => out.indexOf(s) === i);
}
