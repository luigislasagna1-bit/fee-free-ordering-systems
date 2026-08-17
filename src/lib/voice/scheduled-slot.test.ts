/**
 * Phone scheduling — the caller's words → a slot the checkout would offer.
 *
 * Every assertion is in the RESTAURANT's clock (America/Toronto) with `now`
 * pinned, because the whole point of the module is that timezone arithmetic
 * is a computed fact, never the model's guess (A64(b), 2026-08-17).
 */
import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  describeSlot,
  firstOfferableSlot,
  parseDatePhrase,
  parseTimePhrase,
  resolveWhen,
  simpleSlotRules,
  validateScheduledSlot,
  type SlotRules,
} from "./scheduled-slot";

const TZ = "America/Toronto";
/** Tuesday 2026-08-18, 14:00 EDT (18:00Z). */
const NOW = new Date("2026-08-18T18:00:00Z");
const TODAY = "2026-08-18";
const rules = (o: Parameters<typeof simpleSlotRules>[0] = {}): SlotRules => simpleSlotRules({ timezone: TZ, ...o });
const check = (when: { date?: string; time?: string }, r: SlotRules = rules(), type: "pickup" | "delivery" = "pickup", now = NOW) =>
  validateScheduledSlot({ rules: r, type, when, now });

/* ─────────────────────────────── parsing ─────────────────────────────── */

describe("parseTimePhrase", () => {
  it("clock times with and without a.m./p.m.", () => {
    expect(parseTimePhrase("6 pm")).toEqual({ kind: "clock", h: 18, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("6pm")).toEqual({ kind: "clock", h: 18, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("6 p.m.")).toEqual({ kind: "clock", h: 18, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("6:30 PM")).toEqual({ kind: "clock", h: 18, m: 30, meridiem: "pm" });
    expect(parseTimePhrase("18:00")).toEqual({ kind: "clock", h: 18, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("09:30")).toEqual({ kind: "clock", h: 9, m: 30, meridiem: "am" });
    expect(parseTimePhrase("6")).toEqual({ kind: "clock", h: 6, m: 0, meridiem: null });
    expect(parseTimePhrase("6:30")).toEqual({ kind: "clock", h: 6, m: 30, meridiem: null });
    expect(parseTimePhrase("12")).toEqual({ kind: "clock", h: 12, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("12 am")).toEqual({ kind: "clock", h: 0, m: 0, meridiem: "am" });
    expect(parseTimePhrase("noon")).toEqual({ kind: "clock", h: 12, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("6 in the evening")).toEqual({ kind: "clock", h: 18, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("6 tonight")).toEqual({ kind: "clock", h: 18, m: 0, meridiem: "pm" });
    expect(parseTimePhrase("7 in the morning")).toEqual({ kind: "clock", h: 7, m: 0, meridiem: "am" });
    expect(parseTimePhrase("six thirty")).toEqual({ kind: "clock", h: 6, m: 30, meridiem: null });
    expect(parseTimePhrase("six-thirty pm")).toEqual({ kind: "clock", h: 18, m: 30, meridiem: "pm" });
    expect(parseTimePhrase("half past six")).toEqual({ kind: "clock", h: 6, m: 30, meridiem: null });
    expect(parseTimePhrase("quarter to seven pm")).toEqual({ kind: "clock", h: 18, m: 45, meridiem: "pm" });
    expect(parseTimePhrase("6 o'clock")).toEqual({ kind: "clock", h: 6, m: 0, meridiem: null });
  });
  it("relative times", () => {
    expect(parseTimePhrase("in 30 minutes")).toEqual({ kind: "relative", minutes: 30 });
    expect(parseTimePhrase("in an hour")).toEqual({ kind: "relative", minutes: 60 });
    expect(parseTimePhrase("in an hour and a half")).toEqual({ kind: "relative", minutes: 90 });
    expect(parseTimePhrase("half an hour from now")).toEqual({ kind: "relative", minutes: 30 });
  });
  it("not a time", () => {
    expect(parseTimePhrase("tomorrow")).toBeNull();
    expect(parseTimePhrase("tuesday")).toBeNull();
    expect(parseTimePhrase("")).toBeNull();
    expect(parseTimePhrase(undefined)).toBeNull();
  });
});

describe("parseDatePhrase", () => {
  it("relative days", () => {
    expect(parseDatePhrase("")).toEqual({ kind: "today" });
    expect(parseDatePhrase("today")).toEqual({ kind: "today" });
    expect(parseDatePhrase("tonight")).toEqual({ kind: "today" });
    expect(parseDatePhrase("tomorrow")).toEqual({ kind: "offset", days: 1 });
    expect(parseDatePhrase("tomorrow evening")).toEqual({ kind: "offset", days: 1 });
    expect(parseDatePhrase("day after tomorrow")).toEqual({ kind: "offset", days: 2 });
    expect(parseDatePhrase("in 3 days")).toEqual({ kind: "offset", days: 3 });
  });
  it("weekdays, ISO and month-day", () => {
    expect(parseDatePhrase("Tuesday")).toEqual({ kind: "weekday", dow: 2, next: false });
    expect(parseDatePhrase("next friday")).toEqual({ kind: "weekday", dow: 5, next: true });
    expect(parseDatePhrase("on Sat")).toEqual({ kind: "weekday", dow: 6, next: false });
    expect(parseDatePhrase("2026-08-25")).toEqual({ kind: "explicit", dateKey: "2026-08-25" });
    expect(parseDatePhrase("August 25")).toEqual({ kind: "monthday", month: 7, day: 25 });
    expect(parseDatePhrase("the 25th")).toEqual({ kind: "monthday", month: null, day: 25 });
  });
  it("a bare number or a time is NOT a day (the model put the time in the wrong field)", () => {
    expect(parseDatePhrase("6")).toBeNull();
    expect(parseDatePhrase("6 pm")).toBeNull();
    expect(parseDatePhrase("18:00")).toBeNull();
    expect(parseDatePhrase("sometime")).toBeNull();
  });
});

/* ─────────────────────────────── resolving ────────────────────────────── */

describe("resolveWhen — the restaurant's clock, never the server's", () => {
  it("'today' + '6 pm' at 14:00 Toronto → today 18:00 local", () => {
    const r = resolveWhen({ date: "today", time: "6 pm" }, NOW, TZ);
    expect(r).toMatchObject({ ok: true, dateKey: TODAY, hhmm: "18:00" });
  });
  it("'tomorrow' is the next LOCAL calendar date even late at night (23:30 Toronto = 03:30Z next day)", () => {
    const lateNight = new Date("2026-08-19T03:30:00Z"); // 23:30 EDT on Aug 18
    const r = resolveWhen({ date: "tomorrow", time: "10 am" }, lateNight, TZ);
    expect(r).toMatchObject({ ok: true, dateKey: "2026-08-19", hhmm: "10:00" });
  });
  it("a weekday is the next such day — today when the time is still ahead, next week when it has passed", () => {
    // NOW is Tuesday 14:00.
    expect(resolveWhen({ date: "Tuesday", time: "6 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: TODAY });
    expect(resolveWhen({ date: "Tuesday", time: "1 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: addDaysToDateKey(TODAY, 7) });
    expect(resolveWhen({ date: "next Tuesday", time: "6 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: addDaysToDateKey(TODAY, 7) });
    expect(resolveWhen({ date: "Friday", time: "6 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: "2026-08-21" });
    expect(resolveWhen({ date: "Monday", time: "6 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: "2026-08-24" });
  });
  it("the whole phrase in one field still resolves", () => {
    expect(resolveWhen({ time: "tomorrow at 6 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: "2026-08-19", hhmm: "18:00" });
    expect(resolveWhen({ date: "Friday at 6:30 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: "2026-08-21", hhmm: "18:30" });
    expect(resolveWhen({ time: "6 tonight" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: TODAY, hhmm: "18:00" });
    expect(resolveWhen({ date: "6 pm" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: TODAY, hhmm: "18:00" });
  });
  it("an hour with no a.m./p.m.: the store's hours decide (6 → 18:00 when only the evening is open)", () => {
    const openAt = (_d: string, hhmm: string) => hhmm >= "11:00" && hhmm < "23:00";
    expect(resolveWhen({ time: "6" }, NOW, TZ, openAt)).toMatchObject({ ok: true, hhmm: "18:00", meridiemGuessed: true });
    // 9 → 9 AM already passed at 14:00, 9 PM open → evening.
    expect(resolveWhen({ time: "9" }, NOW, TZ, openAt)).toMatchObject({ ok: true, hhmm: "21:00" });
    // A 24-hour store: both open → ask.
    expect(resolveWhen({ date: "tomorrow", time: "6" }, NOW, TZ, () => true)).toMatchObject({ ok: false, code: "ambiguous_time" });
  });
  it("relative: 'in an hour' from now, restaurant clock", () => {
    expect(resolveWhen({ time: "in an hour" }, NOW, TZ)).toMatchObject({ ok: true, dateKey: TODAY, hhmm: "15:00", relative: true });
  });
  it("missing / unparseable", () => {
    expect(resolveWhen({ date: "tomorrow" }, NOW, TZ)).toMatchObject({ ok: false, code: "missing_time" });
    expect(resolveWhen({ date: "someday", time: "6 pm" }, NOW, TZ)).toMatchObject({ ok: false, code: "bad_when" });
    expect(resolveWhen({ time: "whenever" }, NOW, TZ)).toMatchObject({ ok: false, code: "bad_when" });
  });
});

/* ─────────────────────────────── describing ───────────────────────────── */

describe("describeSlot", () => {
  it("today / tomorrow / weekday / far date, in the store's 12h or 24h format", () => {
    expect(describeSlot(TODAY, "18:00", NOW, TZ, "12h")).toBe("today at 6:00 PM");
    expect(describeSlot("2026-08-19", "12:30", NOW, TZ, "12h")).toBe("tomorrow, Wednesday, at 12:30 PM");
    expect(describeSlot("2026-08-21", "18:00", NOW, TZ, "12h")).toBe("Friday at 6:00 PM");
    expect(describeSlot("2026-08-21", "18:00", NOW, TZ, "24h")).toBe("Friday at 18:00");
    expect(describeSlot("2026-09-01", "18:00", NOW, TZ, "12h")).toBe("Tuesday, September 1, at 6:00 PM");
  });
});

/* ─────────────────────────────── validating ───────────────────────────── */

describe("validateScheduledSlot — the website's rules, applied to a spoken time", () => {
  it("a valid time later today → scheduledFor in the restaurant's wall clock + spoken words", () => {
    const v = check({ date: "today", time: "6 pm" });
    expect(v).toMatchObject({ ok: true, scheduledFor: `${TODAY}T18:00`, spoken: "today at 6:00 PM", snapped: false, isToday: true, scheduledStyle: "bands" });
  });
  it("tomorrow at noon, delivery", () => {
    const v = check({ date: "tomorrow", time: "noon" }, rules(), "delivery");
    expect(v).toMatchObject({ ok: true, scheduledFor: "2026-08-19T12:00", spoken: "tomorrow, Wednesday, at 12:00 PM", isTomorrow: true });
  });
  it("too soon: now + prep is the floor (14:00 + 20 min) — refused with the earliest slot", () => {
    const v = check({ time: "in 10 minutes" });
    expect(v).toMatchObject({ ok: false, code: "preorder_too_soon" });
    if (!v.ok) expect(v.earliest).toEqual({ scheduledFor: `${TODAY}T14:30`, spoken: "today at 2:30 PM" });
  });
  it("min lead time (website setting) is honoured and named", () => {
    const v = check({ time: "2:45 pm" }, rules({ minLeadMinutes: 60 }));
    expect(v).toMatchObject({ ok: false, code: "preorder_too_soon" });
    if (!v.ok) {
      expect(v.message).toMatch(/60 minutes' notice/);
      expect(v.earliest?.scheduledFor).toBe(`${TODAY}T15:00`);
    }
    expect(check({ time: "3 pm" }, rules({ minLeadMinutes: 60 }))).toMatchObject({ ok: true, scheduledFor: `${TODAY}T15:00` });
  });
  it("max days ahead (website setting): refused past the cap, with the last day", () => {
    const v = check({ date: "2026-09-10", time: "6 pm" }, rules({ maxAdvanceDays: 7 }));
    expect(v).toMatchObject({ ok: false, code: "preorder_too_far" });
    if (!v.ok) expect(v.latest).toMatchObject({ dateKey: "2026-08-25", maxDays: 7 });
    expect(check({ date: "2026-08-25", time: "1 pm" }, rules({ maxAdvanceDays: 7 }))).toMatchObject({ ok: true });
  });
  it("outside opening hours: refused with the day's windows and the next slot", () => {
    const v = check({ date: "tomorrow", time: "9 am" });
    expect(v).toMatchObject({ ok: false, code: "outside_opening_hours" });
    if (!v.ok) {
      expect(v.windows).toBe("11:00 AM – 11:00 PM");
      expect(v.earliest).toEqual({ scheduledFor: "2026-08-19T11:00", spoken: "tomorrow, Wednesday, at 11:00 AM" });
    }
  });
  it("in the past → scheduled_in_past with the earliest slot", () => {
    const v = check({ time: "1 pm" });
    expect(v).toMatchObject({ ok: false, code: "scheduled_in_past" });
    if (!v.ok) expect(v.earliest?.scheduledFor).toBe(`${TODAY}T14:30`);
  });
  it("closed day (weekly) → outside_opening_hours naming the day, earliest on the next open day", () => {
    const r = rules();
    r.openingHours = r.openingHours.map((row) => (row.dayOfWeek === 1 ? { ...row, isOpen: false } : row)); // Mondays closed
    const v = check({ date: "Monday", time: "6 pm" }, r);
    expect(v).toMatchObject({ ok: false, code: "outside_opening_hours" });
    if (!v.ok) {
      expect(v.message).toMatch(/Monday/);
      expect(v.earliest?.scheduledFor).toBe("2026-08-25T11:00");
    }
  });
  it("holiday closure → holiday_closed with its name", () => {
    const r = rules();
    r.holidays = [{ date: new Date("2026-08-19T00:00:00Z"), name: "Staff day" } as never];
    const v = check({ date: "tomorrow", time: "6 pm" }, r);
    expect(v).toMatchObject({ ok: false, code: "holiday_closed", holidayName: "Staff day" });
    if (!v.ok) expect(v.earliest?.scheduledFor).toBe("2026-08-20T11:00");
  });
  it("slot grid: 6:10 snaps up to 6:15 and says so; a time with no slot within one step names the neighbours", () => {
    const v = check({ time: "6:10 pm" });
    expect(v).toMatchObject({ ok: true, scheduledFor: `${TODAY}T18:15`, snapped: true, requestedSpoken: "today at 6:10 PM", spoken: "today at 6:15 PM" });
    // Closes at 23:00: 22:50 has no 15-min slot before close (last is 22:45).
    const late = check({ time: "10:50 pm" });
    expect(late).toMatchObject({ ok: false, code: "slot_not_offered" });
    if (!late.ok) expect(late.nearestBefore?.scheduledFor).toBe(`${TODAY}T22:45`);
  });
  it("exact-time style accepts any minute inside the windows", () => {
    const r = rules();
    r.serviceSettings = JSON.stringify({ pickup: { slotModes: ["exact"] } });
    expect(check({ time: "6:10 pm" }, r)).toMatchObject({ ok: true, scheduledFor: `${TODAY}T18:10`, scheduledStyle: "exact", snapped: false });
  });
  it("first-order delay after opening (website setting) → first_order_delay with the earliest honest time", () => {
    const r = rules();
    r.serviceSettings = JSON.stringify({ pickup: { firstOrderDelayMinutes: 30 } });
    const v = check({ date: "tomorrow", time: "11:15 am" }, r);
    expect(v).toMatchObject({ ok: false, code: "first_order_delay" });
    if (!v.ok) expect(v.earliest?.scheduledFor).toBe("2026-08-19T11:30");
  });
  it("a paused service refuses times before it resumes and offers the first slot after", () => {
    const r = rules();
    r.pickupPausedUntil = new Date("2026-08-18T21:00:00Z"); // 17:00 EDT
    const v = check({ time: "4 pm" }, r);
    expect(v).toMatchObject({ ok: false, code: "service_paused" });
    if (!v.ok) expect(v.earliest?.scheduledFor).toBe(`${TODAY}T17:00`);
    expect(check({ time: "5:30 pm" }, r)).toMatchObject({ ok: true });
  });
  it("a service the store does not offer", () => {
    const r = rules();
    r.acceptsDelivery = false;
    expect(check({ time: "6 pm" }, r, "delivery")).toMatchObject({ ok: false, code: "service_not_offered" });
  });
  it("an hour with no a.m./p.m. is settled by the store's hours: '6' at 14:00 is 6 PM", () => {
    expect(check({ time: "6" })).toMatchObject({ ok: true, scheduledFor: `${TODAY}T18:00`, meridiemGuessed: true });
  });
  it("24h store format speaks 24h", () => {
    expect(check({ time: "6 pm" }, rules({ hoursFormat: "24h" }))).toMatchObject({ ok: true, spoken: "today at 18:00" });
  });
  it("overnight hours: 1 AM tomorrow is inside tonight's window (spill)", () => {
    const r = rules({ open: "17:00", close: "02:00" });
    expect(check({ date: "tomorrow", time: "1 am" }, r)).toMatchObject({ ok: true, scheduledFor: "2026-08-19T01:00" });
    expect(check({ date: "tomorrow", time: "3 am" }, r)).toMatchObject({ ok: false, code: "outside_opening_hours" });
  });
});

describe("firstOfferableSlot", () => {
  it("scans forward from a moment inside a closed stretch to the next open slot", () => {
    const r = rules();
    const s = firstOfferableSlot(r, "pickup", new Date("2026-08-19T03:30:00Z") /* 23:30 EDT Aug 18 */, NOW);
    expect(s).toEqual({ dateKey: "2026-08-19", hhmm: "11:00" });
  });
});
