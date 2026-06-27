/** Verify the per-service closure custom-message fix (Fabrizio): the custom note on a
 *  per-service extraordinary closure now surfaces on the banner. Pure logic, no DB.
 *    npx tsx scripts/_verify-closure-message.ts
 */
import { resolveTodayHolidayClosure } from "../src/lib/holiday-rules";
import { dateKeyInTimezone } from "../src/lib/restaurant-hours";

const TZ = "America/Toronto";
const TODAY = dateKeyInTimezone(new Date(), TZ);
let pass = 0, fail = 0;
const ok = (label: string, got: unknown, want: unknown) => {
  const c = JSON.stringify(got) === JSON.stringify(want);
  console.log(`  ${c ? "✅" : "❌ FAIL"} ${label}${c ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  c ? pass++ : fail++;
};
const closure = (rows: any[]) => resolveTodayHolidayClosure(rows as any, TZ).todayHolidayMessage;

// 1. THE FIX — per-service CLOSED-WINDOW with a message (Fabrizio's exact case).
const M1 = "Pickup paused 4–8pm for a private event.";
ok("per-service closed-window message surfaces", closure([{ date: TODAY, message: M1, rules: JSON.stringify([{ services: ["pickup"], mode: "closed_windows", intervals: [{ open: "16:00", close: "20:00" }] }]) }]), M1);

// 2. THE FIX — per-service CUSTOM-HOURS with a message.
const M2 = "Delivery only 6–9pm today.";
ok("per-service custom-hours message surfaces", closure([{ date: TODAY, message: M2, rules: JSON.stringify([{ services: ["delivery"], mode: "open", intervals: [{ open: "18:00", close: "21:00" }] }]) }]), M2);

// 3. Regression — full-closed service message still works.
const M3 = "Closed for pickup today.";
ok("full-closed service message still works", closure([{ date: TODAY, message: M3, rules: JSON.stringify([{ services: ["pickup"], mode: "closed" }]) }]), M3);

// 4. Regression — general (all-services) message still preferred.
const M4 = "Closed all day for the holiday.";
ok("general all-services message still works", closure([{ date: TODAY, message: M4, rules: JSON.stringify([{ services: null, mode: "closed" }]) }]), M4);

// 5. Regression — no message set → no spurious banner note.
ok("no message → null", closure([{ date: TODAY, rules: JSON.stringify([{ services: ["pickup"], mode: "closed_windows", intervals: [{ open: "16:00", close: "20:00" }] }]) }]), null);

console.log(`\n${fail === 0 ? "🎉 verified" : `⚠️  ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
process.exit(fail === 0 ? 0 : 1);
