/**
 * Pure-logic verification of the drip step-selection algorithm (Luigi 2026-06-10).
 * Mirrors the decision in runSteppedCampaign (src/lib/autopilot.ts) exactly —
 * highest DUE step + reorder-restart via sentAt > lastOrderAt. No DB, no email.
 *   npx tsx scripts/verify-drip-logic.ts
 */
const DAY = 86_400_000;

type Step = { stepNumber: number; delayHours: number };
type Send = { sequence: number; sentAt: number };

// Exactly the runSteppedCampaign decision.
function pickStep(steps: Step[], sends: Send[], lrefMs: number, now: number): number | null {
  const relevant = sends.filter((s) => s.sentAt > lrefMs);
  const lastSentStep = relevant.reduce((m, s) => Math.max(m, s.sequence), 0);
  const daysSince = (now - lrefMs) / DAY;
  const due = steps.filter((s) => s.stepNumber > lastSentStep && daysSince >= s.delayHours / 24);
  return due.length ? due[due.length - 1].stepNumber : null;
}

// 5-tier ladder: 7/14/21/28/35 days.
const LADDER: Step[] = [1, 2, 3, 4, 5].map((n) => ({ stepNumber: n, delayHours: n * 7 * 24 }));
const NOW = 1_000_000_000_000; // fixed clock

let pass = 0;
let fail = 0;
function check(name: string, got: number | null, want: number | null) {
  const ok = got === want;
  console.log(`  ${ok ? "✅" : "❌"} ${name} → got ${got}, want ${want}`);
  ok ? pass++ : fail++;
}

// 1) 7-day lapsed, never emailed → step 1.
check("7-day lapsed, no sends", pickStep(LADDER, [], NOW - 7 * DAY, NOW), 1);

// 2) 30-day lapsed, never emailed → jump to highest due (step 4 = 28d; step 5 = 35d not yet).
check("30-day lapsed, no sends (jump)", pickStep(LADDER, [], NOW - 30 * DAY, NOW), 4);

// 3) 40-day lapsed, never emailed → top of ladder (step 5).
check("40-day lapsed, no sends", pickStep(LADDER, [], NOW - 40 * DAY, NOW), 5);

// 4) 8-day lapsed, step 1 already sent (after last order) → not due yet (step 2 = 14d) → null.
check("8-day, step1 sent → wait", pickStep(LADDER, [{ sequence: 1, sentAt: NOW - 1 * DAY }], NOW - 8 * DAY, NOW), null);

// 5) 15-day lapsed, step 1 sent at day 7 → step 2 due (14d) → step 2.
check("15-day, step1 sent → step 2", pickStep(LADDER, [{ sequence: 1, sentAt: NOW - 8 * DAY }], NOW - 15 * DAY, NOW), 2);

// 6) REORDER restart: old sends (steps 1-3) are BEFORE the new lastOrderAt → ignored.
//    Customer re-ordered 5 days ago; prior ladder sends were 20+ days ago.
const reorderSends: Send[] = [
  { sequence: 1, sentAt: NOW - 30 * DAY },
  { sequence: 2, sentAt: NOW - 23 * DAY },
  { sequence: 3, sentAt: NOW - 16 * DAY },
];
check("reorder 5d ago → nothing due yet", pickStep(LADDER, reorderSends, NOW - 5 * DAY, NOW), null);

// 7) ...and once they lapse 7d past the reorder → ladder restarts at step 1.
check("reorder then 7d lapse → step 1 again", pickStep(LADDER, reorderSends, NOW - 7 * DAY, NOW), 1);

// 8) No double-send: highest step already sent this lapse, nothing higher due → null.
check("step 5 sent, 40d → done", pickStep(LADDER, [{ sequence: 5, sentAt: NOW - 1 * DAY }], NOW - 40 * DAY, NOW), null);

console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"}: ${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
