/**
 * "tomorrow (Saturday) at 10:00 AM" — a future moment as the caller would say
 * it, in the RESTAURANT's timezone and its 12h/24h preference.
 *
 * WHY (2026-08-16, Luigi's 00:30 call): the prompt used to hand the model the
 * raw UTC ISO ("…T14:00:00Z") plus "say that in local time", and it answered
 * "we reopen at two o'clock this afternoon" — the UTC hour — for a store that
 * opens at 10. Timezone arithmetic is a fact, and facts are computed here.
 *
 * Lives in its own prisma-free module (extracted from context-payload.ts,
 * 2026-08-20) so the Twilio greeting composer and pure libs can use it without
 * dragging the DB client into their import graph; context-payload re-exports
 * it, so every existing import keeps working.
 *
 * Pure and exported for the test. `today` / `tomorrow` are decided on local
 * calendar dates (not 24 h deltas), so a 00:30 call correctly says "tomorrow"
 * for a 10 AM opening even though it is only 9½ hours away.
 */
import { dateKeyInTimezone, formatHour, localDowAndHHMM } from "@/lib/restaurant-hours";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function describeNextOpen(
  next: Date,
  now: Date,
  timezone: string | undefined,
  format: "12h" | "24h",
): string {
  const tz = timezone || "UTC";
  const { dow, hhmm } = localDowAndHHMM(next, tz);
  const time = formatHour(hhmm, format) || hhmm;
  let dayKeyNext: string;
  let dayKeyNow: string;
  let dayKeyTomorrow: string;
  try {
    dayKeyNext = dateKeyInTimezone(next, tz);
    dayKeyNow = dateKeyInTimezone(now, tz);
    // Local "tomorrow" = the local date 24 h from now (DST shifts by ±1 h can't
    // move a date key by a whole day at any hour except exactly midnight, and a
    // one-hour miss there still yields a correct weekday name below).
    dayKeyTomorrow = dateKeyInTimezone(new Date(now.getTime() + 24 * 3600 * 1000), tz);
  } catch {
    return `${WEEKDAY[dow] ?? ""} at ${time}`.trim();
  }
  if (dayKeyNext === dayKeyNow) {
    // Same local date. A 00:30 caller asking "for tomorrow" hears "this
    // morning at 10:00 AM" — correct AND natural, where "today" would sound
    // like a contradiction of what they just said.
    const hour = parseInt(hhmm.slice(0, 2), 10);
    const part = hour < 12 ? "this morning" : hour < 17 ? "this afternoon" : "this evening";
    return `${part} at ${time}`;
  }
  if (dayKeyNext === dayKeyTomorrow) return `tomorrow (${WEEKDAY[dow]}) at ${time}`;
  return `${WEEKDAY[dow]} at ${time}`;
}
