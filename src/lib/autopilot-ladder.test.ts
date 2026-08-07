import { describe, it, expect } from "vitest";
import { pickDueStep, type LadderStep, type PriorSend } from "@/lib/autopilot-ladder";

/**
 * Regression tests for the 2026-08-07 spam incident.
 *
 * A win-back ladder restarts when the customer re-orders. The old code measured
 * "is this step due?" against the customer's last order, but de-duped sends on a
 * key that had no notion of a cycle. So after a re-order the step looked un-sent
 * AND could not be recorded — the runner mailed it, failed to write the record,
 * and did the identical thing again the next cron hour. One address received
 * ~50 copies of the same email over two days.
 *
 * `pickDueStep` now matches prior sends on the SAME anchor it measures from, so
 * the read and the write can never disagree.
 */

const STEPS: LadderStep[] = [
  { stepNumber: 1, delayHours: 72 },   // 3 days
  { stepNumber: 2, delayHours: 336 },  // 14 days
  { stepNumber: 3, delayHours: 504 },  // 21 days
  { stepNumber: 4, delayHours: 672 },  // 28 days
];

const at = (iso: string) => new Date(iso);
const ORDERED = at("2026-08-02T00:00:00Z");

describe("pickDueStep — the hourly-spam regression", () => {
  it("does NOT resend a step already sent in THIS cycle", () => {
    // The exact shape that spammed: a step-1 record exists for the current
    // cycle. It must never fire again, no matter how many times the cron runs.
    const prior: PriorSend[] = [{ sequence: 1, cycleKey: ORDERED }];
    for (const hour of [0, 1, 2, 3, 24, 100]) {
      const now = new Date(ORDERED.getTime() + (5 * 24 + hour) * 3_600_000);
      expect(pickDueStep(STEPS, prior, ORDERED, now)?.stepNumber ?? null).not.toBe(1);
    }
  });

  it("stays completely silent between steps once step 1 is recorded", () => {
    const prior: PriorSend[] = [{ sequence: 1, cycleKey: ORDERED }];
    // Day 5: step 1 done, step 2 not due until day 14 → nothing at all.
    const day5 = new Date(ORDERED.getTime() + 5 * 86_400_000);
    expect(pickDueStep(STEPS, prior, ORDERED, day5)).toBeNull();
  });

  it("treats a record from a PREVIOUS lapse as not-this-cycle (ladder restarts)", () => {
    // The intended feature: an old send from before the customer re-ordered
    // must not suppress the new cycle's step 1...
    const previousCycle = at("2026-06-01T00:00:00Z");
    const prior: PriorSend[] = [{ sequence: 1, cycleKey: previousCycle }];
    const day5 = new Date(ORDERED.getTime() + 5 * 86_400_000);
    expect(pickDueStep(STEPS, prior, ORDERED, day5)?.stepNumber).toBe(1);
    // ...and crucially, once THAT send is recorded against the new cycle, it
    // stops. Under the old key this write was impossible, which is what looped.
    const afterSend: PriorSend[] = [...prior, { sequence: 1, cycleKey: ORDERED }];
    expect(pickDueStep(STEPS, afterSend, ORDERED, day5)).toBeNull();
  });

  it("ignores legacy records that have no cycle key at all", () => {
    // Rows written before the column existed are backfilled, but a null must
    // never be read as "matches this cycle".
    const prior: PriorSend[] = [{ sequence: 1, cycleKey: null }];
    const day5 = new Date(ORDERED.getTime() + 5 * 86_400_000);
    expect(pickDueStep(STEPS, prior, ORDERED, day5)?.stepNumber).toBe(1);
  });
});

describe("pickDueStep — normal ladder behaviour is unchanged", () => {
  it("sends nothing before the first step is due", () => {
    const day2 = new Date(ORDERED.getTime() + 2 * 86_400_000);
    expect(pickDueStep(STEPS, [], ORDERED, day2)).toBeNull();
  });

  it("sends step 1 once the 72h delay has passed", () => {
    const day3 = new Date(ORDERED.getTime() + 3 * 86_400_000);
    expect(pickDueStep(STEPS, [], ORDERED, day3)?.stepNumber).toBe(1);
  });

  it("jumps a deeply-lapsed customer straight to the highest due step", () => {
    // 30 days out with nothing sent: go to step 4, not step 1.
    const day30 = new Date(ORDERED.getTime() + 30 * 86_400_000);
    expect(pickDueStep(STEPS, [], ORDERED, day30)?.stepNumber).toBe(4);
  });

  it("walks the ladder one step at a time as each is recorded", () => {
    const day30 = new Date(ORDERED.getTime() + 30 * 86_400_000);
    const prior: PriorSend[] = [{ sequence: 4, cycleKey: ORDERED }];
    // Top of the ladder reached — nothing left, ever, for this cycle.
    expect(pickDueStep(STEPS, prior, ORDERED, day30)).toBeNull();
  });

  it("resumes at the next step when a lower one is already recorded", () => {
    const day21 = new Date(ORDERED.getTime() + 21 * 86_400_000);
    const prior: PriorSend[] = [{ sequence: 1, cycleKey: ORDERED }];
    expect(pickDueStep(STEPS, prior, ORDERED, day21)?.stepNumber).toBe(3);
  });
});
