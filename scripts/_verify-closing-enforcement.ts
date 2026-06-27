/** Verify Fabrizio's "Closing days / closed services" report through the REAL
 *  enforcement functions the order + reservation routes call (no DB needed).
 *  Run: npx tsx scripts/_verify-closing-enforcement.ts
 *
 *  Fabrizio's exact tests (2026-06-22, pre-fix build):
 *   1. Reservations CLOSED today → still let him place reservation #BM23GR.
 *   2. Pickup CLOSED 16:00–20:00 today → still let him place a 5PM pickup (ORD-766130010).
 */
import {
  holidayEffectForDay,
  hhmmInsideIntervals,
  resolveTodayHolidayClosure,
} from "../src/lib/holiday-rules";
import { dateKeyInTimezone } from "../src/lib/restaurant-hours";

const TZ = "America/Toronto";
const TODAY = dateKeyInTimezone(new Date(), TZ);

// Exactly what Fabrizio configured: reservations closed all day + pickup closed 16:00–20:00.
const holidays = [
  { date: TODAY, rules: JSON.stringify([{ services: ["reservation"], mode: "closed" }]) },
  { date: TODAY, rules: JSON.stringify([{ services: ["pickup"], mode: "closed_windows", intervals: [{ open: "16:00", close: "20:00" }] }]) },
] as any;

let pass = 0, fail = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${ok ? "✅" : "❌ FAIL"} ${label}${ok ? "" : ` — got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`}`);
  ok ? pass++ : fail++;
}

console.log(`Today (${TZ}): ${TODAY}`);

console.log(`\n── CASE 1: reservations CLOSED today (his #BM23GR) ──`);
check("reservation effect = closed  ⇒ reservation route returns 400", holidayEffectForDay(holidays, TODAY, "reservation")?.kind, "closed");

console.log(`\n── CASE 2: pickup CLOSED 16:00–20:00 today (his 5PM ORD-766130010) ──`);
const pick = holidayEffectForDay(holidays, TODAY, "pickup");
check("pickup effect = closed_windows", pick?.kind, "closed_windows");
if (pick?.kind === "closed_windows") {
  check("5:00 PM pickup INSIDE window ⇒ order route returns 400 (his exact case)", hhmmInsideIntervals("17:00", pick.intervals), true);
  check("3:00 PM pickup OUTSIDE (before) ⇒ allowed", hhmmInsideIntervals("15:00", pick.intervals), false);
  check("8:00 PM pickup at window-end (exclusive) ⇒ allowed", hhmmInsideIntervals("20:00", pick.intervals), false);
  check("9:00 PM pickup OUTSIDE (after) ⇒ allowed", hhmmInsideIntervals("21:00", pick.intervals), false);
}

console.log(`\n── Non-regression: ONLY the configured service/window is blocked ──`);
check("delivery at 5PM unaffected (only pickup was closed) ⇒ allowed", holidayEffectForDay(holidays, TODAY, "delivery"), null);
check("dine-in at 5PM unaffected ⇒ allowed", holidayEffectForDay(holidays, TODAY, "dine_in"), null);

console.log(`\n── CASE 3: customer BANNER data (resolveTodayHolidayClosure) ──`);
const closure = resolveTodayHolidayClosure(holidays, TZ);
check("banner lists a pickup closed-window ⇒ amber banner shows", closure.holidayClosedWindows.some((g) => g.service === "pickup"), true);
check("pickup window text = 16:00–20:00", closure.holidayClosedWindows.find((g) => g.service === "pickup")?.intervals, [{ open: "16:00", close: "20:00" }]);

console.log(`\n${fail === 0 ? "🎉 ALL PASS — Fabrizio's cases are now enforced" : `⚠️  ${fail} FAILED`}  (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
