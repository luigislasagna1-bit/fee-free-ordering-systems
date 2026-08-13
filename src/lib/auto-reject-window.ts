// ─────────────────────────────────────────────────────────────────────────────
// How long a pending order may sit before it is auto-rejected — the single
// source for the NUMBER, so the cron that enforces it and the email that quotes
// it can never disagree.
//
// Split out of auto-reject-orders.ts (Luigi 2026-08-12) because the store's
// new-order email needed to state the real window. It used to say "auto-reject
// runs if no action is taken within your configured timeout", which is wrong
// twice over: there is no per-restaurant setting, and the reader is left with
// no idea whether they have one minute or one hour.
//
// No prisma/stripe imports, so quoting the window costs an email nothing.
// ─────────────────────────────────────────────────────────────────────────────

/** Minutes a regular pending order can sit before we auto-reject.
 *  Matches the kitchen-display visual countdown (4 min) so the bell —
 *  including the full-length 4-minute GloriaFood alert — plays out for the
 *  whole window instead of being cut short when the order is rejected.
 *  MUST stay in sync with the kitchen countdown (KitchenDisplay.tsx `totalMs`,
 *  and the client-side instant reject that hardcodes the same 4 / 15). */
export const DEFAULT_TIMEOUT_MINUTES = 4;

/** Closed-when-placed orders get a longer window — staff may be a few minutes
 *  late arriving after open, and the kitchen UI gives them 15 min from alertAt
 *  before flashing URGENT. Keep auto-reject aligned.
 *  ⚠️ This window starts at `alertAt` (the restaurant's next opening), NOT at
 *  placement — which is why the email quoting it needs its own sentence. */
export const CLOSED_PLACED_TIMEOUT_MINUTES = 15;

/**
 * The window that actually applies to one order, honouring the
 * AUTO_REJECT_TIMEOUT_MINUTES env override exactly as the cron does. Server-side
 * only in practice: the override is a plain (non-NEXT_PUBLIC) env var, so a
 * browser caller always sees the default — which is the same number the kitchen
 * client hardcodes today, so nothing drifts.
 */
export function autoRejectWindowMinutes(placedWhileClosed: boolean): number {
  if (placedWhileClosed) return CLOSED_PLACED_TIMEOUT_MINUTES;
  const envValue = parseInt(process.env.AUTO_REJECT_TIMEOUT_MINUTES ?? "", 10);
  return Number.isFinite(envValue) && envValue > 0 ? envValue : DEFAULT_TIMEOUT_MINUTES;
}
