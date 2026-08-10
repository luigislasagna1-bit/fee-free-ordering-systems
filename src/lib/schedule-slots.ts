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

/**
 * "First scheduled order after opening" (Luigi 2026-08-10): shift every
 * window's OPEN forward by the restaurant's per-service delay so the first
 * offerable slot lands delay minutes after doors open — a customer could
 * previously book the exact opening minute (10:00 delivery at a 10:00 store),
 * demanding food the second the ovens turn on. A window the delay fully
 * consumes is dropped. The close never moves; overnight windows keep their
 * spill (the delay burdens the opening, not the small hours).
 *
 * ONE helper used by the customer slot picker, the auto-fill default
 * computers, AND the server's scheduled-order backstop — the three MUST agree
 * or the picker offers slots the server rejects (the exact defect class the
 * 2026-08-09 pause fix shipped with).
 */
export function shiftIntervalsForFirstOrderDelay(
  intervals: HoursInterval[],
  delayMinutes: number,
): HoursInterval[] {
  const delay = Math.max(0, Math.floor(delayMinutes || 0));
  if (delay === 0) return intervals;
  const out: HoursInterval[] = [];
  for (const iv of intervals) {
    const start = toMin(iv.open);
    const closeRaw = toMin(iv.close);
    const overnight = Boolean(iv.closesNextDay) || closeRaw <= start;
    const shifted = start + delay;
    if (overnight) {
      // Overnight window: delay applies at the evening opening; the wrap
      // (past midnight) still needs the shifted open to stay before 24:00 —
      // beyond that the whole window collapses into the next day (drop; a
      // >6h delay on an overnight window is a misconfiguration, fail closed).
      if (shifted >= 24 * 60) continue;
      out.push({ ...iv, open: toHHMM(shifted) });
      continue;
    }
    if (shifted >= closeRaw) continue; // delay swallowed the whole window
    out.push({ ...iv, open: toHHMM(shifted) });
  }
  return out;
}

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
