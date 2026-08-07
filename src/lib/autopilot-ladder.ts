/**
 * Pure decision logic for the Autopilot win-back ladder — no Prisma, no I/O, so
 * it is unit-testable on its own (same split as reward-rules.ts vs
 * reward-ledger.ts).
 *
 * This module exists because of the 2026-08-07 spam incident: the "should we
 * email this person now?" decision lived inline in the runner, tangled with the
 * database writes, and a mismatch between how a send was READ and how it was
 * WRITTEN went unnoticed until one address had received ~50 copies of the same
 * win-back email, once an hour, for two days.
 */

export type LadderStep = { stepNumber: number; delayHours: number };
export type PriorSend = { sequence: number; cycleKey: Date | null };

/**
 * Which drip step (if any) is due for one customer.
 *
 * `anchor` is the customer's reorder anchor (`lastOrderAt ?? createdAt`). It is
 * BOTH the clock the step delays are measured from AND the cycle key written to
 * AutopilotSend — and prior sends are matched against it by EQUALITY. That
 * identity is the fix: read key and write key are the same value, so they can
 * never drift apart.
 *
 * The old code measured elapsed time from the anchor but de-duped on
 * `(campaign, email, step)`, which carried no cycle. After a re-order moved the
 * anchor forward, a step both looked un-sent (its record predated the anchor)
 * and was un-writable (the record already occupied the unique key) — so the
 * runner mailed it, silently failed to record it, and repeated that every cron
 * hour indefinitely.
 *
 * Returns the HIGHEST due step, so a deeply-lapsed customer jumps straight to
 * the right tier instead of crawling up one cron-hour at a time.
 */
export function pickDueStep(
  steps: LadderStep[],
  priorSends: PriorSend[],
  anchor: Date,
  now: Date,
): LadderStep | null {
  const anchorMs = anchor.getTime();
  // Match on the SAME key the write uses. A null cycleKey (a legacy row not yet
  // backfilled) must never count as "this cycle".
  const thisCycle = priorSends.filter((s) => s.cycleKey != null && s.cycleKey.getTime() === anchorMs);
  const lastSentStep = thisCycle.reduce((m, s) => Math.max(m, s.sequence), 0);
  const daysSince = (now.getTime() - anchorMs) / 86_400_000;
  const due = steps.filter((s) => s.stepNumber > lastSentStep && daysSince >= s.delayHours / 24);
  return due.length > 0 ? due[due.length - 1] : null;
}
