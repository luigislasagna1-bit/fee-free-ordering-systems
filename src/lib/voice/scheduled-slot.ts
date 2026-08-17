/**
 * PHONE SCHEDULING — "for six tonight", "tomorrow at noon", "Tuesday at 6 pm".
 *
 * Luigi's decision A64(b), 2026-08-17: Nabil may take an order for a SPECIFIC
 * later time or day, gated per store by `VoiceAgentConfig.acceptScheduledOrders`,
 * and the WEBSITE's slot rules are the single source of truth. This module is
 * where a caller's words become a slot the checkout would have offered:
 *
 *   1. `resolveWhen`  — the day and time AS THE CALLER SAID THEM ("tomorrow",
 *      "Tuesday", "6 pm", "18:00", "noon", "in an hour") → a restaurant-local
 *      calendar date + HH:MM. Computed HERE, in the restaurant's timezone,
 *      never by the language model (the 2026-08-16 00:30 call: handed a UTC ISO
 *      it said "we reopen at two" for a store that opens at ten).
 *   2. `validateScheduledSlot` — that moment against the store's rules, using
 *      the SAME library functions the checkout picker and /api/orders use
 *      (schedule-slots.ts buildDaySlots + shiftIntervalsForFirstOrderDelay,
 *      service-hours.ts pickHoursForService, holiday-rules.ts holidayEffectForDay,
 *      restaurant-hours.ts rowIntervals / parseLocalDateTimeInTz, slot-modes.ts
 *      resolveSlotModes) and the SAME Restaurant columns (min lead, max days,
 *      prep estimates, per-service slot interval, pauses). It never re-implements
 *      a rule — where /api/orders has a rule the code path is mirrored one for
 *      one, and where the PICKER has a rule the server trusts it to enforce
 *      (the now+prep floor, the slot grid) that rule is applied too, because a
 *      phone caller cannot see a picker.
 *   3. `describeSlot` — the moment in words for the caller ("today at 6:00 PM",
 *      "tomorrow, Tuesday, at 6:00 PM", "Tuesday at 6:00 PM"), timezone and
 *      12h/24h aware; the voice service's spoken-numbers pass turns the digits
 *      into words downstream ("six p.m.").
 *
 * Belt AND braces: /api/orders re-validates `scheduledFor` at quote (dryRun)
 * and placement with its own rules, so this module can only ever be as
 * permissive as the order route — never more.
 *
 * Pure: no Prisma, no network. The internal route and the sim's fake backend
 * both call it with a `SlotRules` (a Restaurant row subset + hours + holidays).
 */
import { dateKeyInTimezone, formatHour, localDowAndHHMM, parseLocalDateTimeInTz, rowIntervals, type OpeningHoursRow } from "@/lib/restaurant-hours";
import { canonicalHolidayService, hhmmInsideIntervals, holidayEffectForDay, type HolidayRow } from "@/lib/holiday-rules";
import { pickHoursForService, type HoursRow } from "@/lib/service-hours";
import { buildDaySlots, shiftIntervalsForFirstOrderDelay, type HoursInterval as SlotInterval } from "@/lib/schedule-slots";
import { resolveSlotModes, type SlotMode } from "@/lib/slot-modes";

/* ────────────────────────────────── types ────────────────────────────────── */

export type ScheduleServiceType = "pickup" | "delivery";

/** The store facts the checkout's scheduling rules read — a Restaurant row
 *  subset plus its hours and holidays. Built by the internal route (Prisma)
 *  and by the simulator (fixture + knobs). */
export type SlotRules = {
  timezone: string | null | undefined;
  hoursFormat: "12h" | "24h";
  openingHours: OpeningHoursRow[];
  holidays: HolidayRow[];
  /** Restaurant.serviceSettings — JSON string of per-service settings. */
  serviceSettings: string | null | undefined;
  scheduledOrderInterval: number | null | undefined;
  /** Restaurant.allowScheduledOrders — the WEB master switch. Mirrors
   *  /api/orders: the lead/max-days rules only run when it is not false. */
  allowScheduledOrders: boolean;
  requireScheduledOrders: boolean;
  pickupMinLeadMinutes: number;
  pickupMaxAdvanceDays: number;
  deliveryMinLeadMinutes: number;
  deliveryMaxAdvanceDays: number;
  estimatedPickup: number;
  estimatedDelivery: number;
  pickupPausedUntil: Date | string | null | undefined;
  deliveryPausedUntil: Date | string | null | undefined;
  acceptsPickup: boolean;
  acceptsDelivery: boolean;
};

export type WhenInput = { date?: string | null; time?: string | null };

export type SlotVerdictCode =
  | "scheduling_off"
  | "service_not_offered"
  | "bad_when"
  | "missing_time"
  | "ambiguous_time"
  | "scheduled_in_past"
  | "service_paused"
  | "holiday_closed"
  | "holiday_custom_hours"
  | "holiday_closed_windows"
  | "outside_opening_hours"
  | "first_order_delay"
  | "slot_not_offered"
  | "preorder_too_soon"
  | "preorder_too_far"
  | "no_slots";

export type SlotSuggestion = { scheduledFor: string; spoken: string };

export type SlotVerdict =
  | {
      ok: true;
      /** Restaurant wall-clock "YYYY-MM-DDTHH:MM" — exactly what /api/orders takes. */
      scheduledFor: string;
      /** Which selection style the checkout would have used for this service. */
      scheduledStyle: SlotMode;
      /** Ready to be said: "today at 6:00 PM" / "tomorrow, Tuesday, at 6:00 PM". */
      spoken: string;
      /** The caller asked for 6:10 and the store offers 15-minute slots → 6:15. */
      snapped: boolean;
      requestedSpoken?: string;
      /** The hour had no a.m./p.m. and the store's hours settled it — say the full time back. */
      meridiemGuessed: boolean;
      isToday: boolean;
      isTomorrow: boolean;
      dateKey: string;
      hhmm: string;
    }
  | {
      ok: false;
      code: SlotVerdictCode;
      /** A plain-English fact for the model to relay (never internals). */
      message: string;
      /** The first slot the store WOULD take at/after what was asked (or after now). */
      earliest?: SlotSuggestion;
      /** For too-far: the last day the store takes orders for. */
      latest?: { dateKey: string; spoken: string; maxDays: number };
      /** For a time between slots: the offered neighbours. */
      nearestBefore?: SlotSuggestion;
      nearestAfter?: SlotSuggestion;
      /** For a closed day/holiday: its name when the owner gave one. */
      holidayName?: string | null;
      /** For hours refusals: the day's open windows in the store's format. */
      windows?: string;
      /** For a paused service: when it resumes. */
      resumesSpoken?: string;
      /** For an a.m./p.m. question: the two moments that both work. */
      candidates?: Array<{ dateKey: string; hhmm: string; spoken: string }>;
    };

/* ─────────────────────────────── constants ──────────────────────────────── */

const DAY_MS = 24 * 3600 * 1000;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** How many days ahead `firstOfferableSlot` scans (the picker looks a week ahead; a bit wider here). */
const SCAN_DAYS = 14;
const MINUTE_RE = /^(\d{2}):(\d{2})$/;

const NUM_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};
const DAY_WORD = "(?:today|tonight|tomorrow|tmrw|day after tomorrow|sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)";
const WEEKDAY_RE = /\b(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day|nesday|sday|urday|rsday)?\b/;
const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, wednes: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, satur: 6 };
const MONTH_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/;
const MONTH_INDEX: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/* ─────────────────────────────── small utils ────────────────────────────── */

const toMin = (hhmm: string): number => {
  const m = MINUTE_RE.exec(hhmm);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
const pad2 = (n: number) => String(n).padStart(2, "0");

/** Calendar day-of-week of a "YYYY-MM-DD" key (0 = Sunday). Noon UTC — no off-by-one. */
export function dowOfDateKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay();
}
/** "YYYY-MM-DD" + n days (calendar arithmetic on the key itself). */
export function addDaysToDateKey(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
const dateKeyOfInstant = (d: Date, tz: string) => dateKeyInTimezone(d, tz);
const instantOf = (dateKey: string, hhmm: string, tz: string | undefined): Date => {
  const m = MINUTE_RE.exec(hhmm) ?? ["", "00", "00"];
  return parseLocalDateTimeInTz(dateKey, parseInt(m[1], 10), parseInt(m[2], 10), tz);
};

function readServiceSettings(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
  } catch {
    return null;
  }
}
const svcKey = (type: ScheduleServiceType) => (type === "delivery" ? "delivery" : "pickup");
const svcLabel = (type: ScheduleServiceType) => (type === "delivery" ? "Delivery" : "Pickup");

/* ────────────────────────────── phrase parsing ──────────────────────────── */

export type ParsedTime =
  | { kind: "clock"; h: number; m: number; meridiem: "am" | "pm" | null }
  | { kind: "relative"; minutes: number };

/**
 * A spoken time → clock or relative. Meridiem stays NULL when the caller did
 * not say it and the hour is 1–11 ("at six") — the store's hours decide below.
 * Returns null when nothing time-like is there.
 */
export function parseTimePhrase(raw: string | null | undefined): ParsedTime | null {
  if (typeof raw !== "string") return null;
  let s = raw.toLowerCase().trim();
  if (!s) return null;
  s = s
    .replace(/(?<=[a-z])-(?=[a-z])/g, " ") // six-thirty, forty-five
    .replace(/\b([ap])\.\s?m\.?/g, "$1m") // p.m. → pm
    .replace(/(\d)\s*([ap])m\b/g, "$1 $2m") // 6pm → 6 pm
    .replace(/\b(at|around|about|approximately|approx|for|by|sharp)\b/g, " ")
    .replace(/@/g, " ")
    .replace(/\bo['’]?\s?clock\b/g, " oclock")
    .replace(/\s+/g, " ")
    .trim();

  // Relative: "in 30 minutes", "in an hour", "in an hour and a half", "half an hour from now"
  {
    const rel = /^(?:in\s+)?(?:(\d+)|an?|one|half an?|a couple of|couple of|two|three)\s*(?:and a half\s*)?(hour|hr|minute|min)s?(?:\s+and\s+(?:a\s+)?half)?(?:\s+from now)?$/.exec(s);
    if (rel) {
      const numTok = rel[1];
      const unit = rel[2].startsWith("h") ? 60 : 1;
      let n = numTok ? parseInt(numTok, 10) : /^half/.test(s) ? 0.5 : /couple|two/.test(s) ? 2 : /three/.test(s) ? 3 : 1;
      if (/and a half/.test(s)) n += 0.5;
      const minutes = Math.round(n * unit);
      if (minutes > 0) return { kind: "relative", minutes };
    }
  }

  // Named moments
  if (/\b(noon|midday|noontime)\b/.test(s)) return { kind: "clock", h: 12, m: 0, meridiem: "pm" };
  if (/\bmidnight\b/.test(s)) return { kind: "clock", h: 0, m: 0, meridiem: "am" };

  // Meridiem / part of day, if said
  let meridiem: "am" | "pm" | null = null;
  if (/\bpm\b|\b(in the |this )?(evening|afternoon)\b|\btonight\b|\bat night\b|\bnight\b/.test(s)) meridiem = "pm";
  else if (/\bam\b|\b(in the |this )?morning\b/.test(s)) meridiem = "am";
  const core = s
    .replace(new RegExp(`\\b(am|pm|tonight|at night|night|in the (morning|afternoon|evening)|this (morning|afternoon|evening)|(morning|afternoon|evening)|today|tomorrow|oclock|on|next|this|the|${DAY_WORD})\\b`, "g"), " ")
    .replace(/\s+/g, " ")
    .trim();
  const clock = (h: number, m: number, mer: "am" | "pm" | null): ParsedTime => ({ kind: "clock", h, m, meridiem: mer });
  const settle = (h: number, mm: number, explicit24: boolean): ParsedTime | null => {
    if (h > 24 || mm > 59) return null;
    if (h === 24) h = 0;
    // 24-hour notation ("18:00", "09:30") is definite — nothing to disambiguate.
    if (explicit24 || h >= 13) return clock(h, mm, h >= 12 ? "pm" : "am");
    if (h === 0) return clock(0, mm, "am");
    if (meridiem === "pm") return clock(h === 12 ? 12 : h + 12, mm, "pm");
    if (meridiem === "am") return clock(h === 12 ? 0 : h, mm, "am");
    // 12 with nothing said is noon in restaurant talk.
    if (h === 12) return clock(12, mm, "pm");
    return clock(h, mm, null);
  };

  // "half past six", "quarter past six", "quarter to seven", "ten to six", "twenty past six"
  {
    const m = /^(half|a quarter|quarter|\d{1,2}|[a-z]+)\s+(past|after|to|till|before)\s+(\d{1,2}|[a-z]+)$/.exec(core);
    if (m) {
      const hourTok = m[3];
      const hour = /^\d+$/.test(hourTok) ? parseInt(hourTok, 10) : NUM_WORDS[hourTok];
      const offTok = m[1];
      const off = offTok === "half" ? 30 : /quarter/.test(offTok) ? 15 : /^\d+$/.test(offTok) ? parseInt(offTok, 10) : NUM_WORDS[offTok];
      if (Number.isFinite(hour) && hour >= 0 && hour <= 23 && Number.isFinite(off) && off > 0 && off < 60) {
        if (m[2] === "past" || m[2] === "after") return settle(hour, off, hour >= 13);
        return settle((hour + 23) % 24, 60 - off, hour >= 13);
      }
    }
  }

  // Digits: "6", "6:30", "6.30", "18:00", "1830", "0930", "6 30"
  {
    const m = /^(\d{1,2})(?:[:.h ]?(\d{2}))?$/.exec(core);
    if (m) {
      const h = parseInt(m[1], 10);
      const mm = m[2] ? parseInt(m[2], 10) : 0;
      // A leading zero ("09:30", "0930") is 24-hour notation.
      const explicit24 = /^0\d/.test(m[1]);
      return settle(h, mm, explicit24);
    }
  }

  // Words: "six", "six thirty", "six fifteen", "six forty five", "six oh five"
  {
    const m = /^([a-z]+)(?:\s+(oh\s+[a-z]+|[a-z]+(?:\s[a-z]+)?))?$/.exec(core);
    if (m && NUM_WORDS[m[1]] !== undefined) {
      const h = NUM_WORDS[m[1]];
      let mm = 0;
      if (m[2]) {
        const t = m[2].replace(/^oh\s+/, "").split(/\s+/);
        mm = t.reduce((acc, w) => acc + (NUM_WORDS[w] ?? NaN), 0);
        if (!Number.isFinite(mm) || mm > 59) return null;
      }
      return settle(h, mm, false);
    }
  }
  return null;
}

export type ParsedDate =
  | { kind: "today" }
  | { kind: "offset"; days: number }
  | { kind: "weekday"; dow: number; next: boolean }
  | { kind: "explicit"; dateKey: string }
  | { kind: "monthday"; month: number | null; day: number };

/** A spoken day → a relative or explicit date. Empty/absent = today. Null = not a day. */
export function parseDatePhrase(raw: string | null | undefined): ParsedDate | null {
  if (typeof raw !== "string" || !raw.trim()) return { kind: "today" };
  const s = raw.toLowerCase().replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(today|tonight|this (morning|afternoon|evening|noon)|later( today)?|now|asap|as soon as possible)$/.test(s)) return { kind: "today" };
  if (/\bday after tomorrow\b/.test(s)) return { kind: "offset", days: 2 };
  if (/\b(tomorrow|tmrw|tomorow|tommorow)\b/.test(s)) return { kind: "offset", days: 1 };
  {
    const m = /^in\s+(\d+|a|an|one|two|three|four|five|six|seven)\s+days?$/.exec(s);
    if (m) {
      const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : m[1] === "a" || m[1] === "an" ? 1 : NUM_WORDS[m[1]];
      if (Number.isFinite(n) && n >= 0) return { kind: "offset", days: n };
    }
  }
  {
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:t.*)?$/.exec(s);
    if (iso) return { kind: "explicit", dateKey: `${iso[1]}-${iso[2]}-${iso[3]}` };
  }
  {
    const wd = WEEKDAY_RE.exec(s);
    if (wd) return { kind: "weekday", dow: WEEKDAY_INDEX[wd[1]], next: /\bnext\b/.test(s) };
  }
  // A time is not a day ("6 pm", "18:00" put in the day field) — the caller decides.
  if (/\b(am|pm)\b|\d:\d{2}|o['’]?clock|noon|midnight/.test(s)) return null;
  {
    // "August 20", "Aug 20th", "20 August", "the 20th", "20th" — a bare number
    // is a day only next to a month name or with an ordinal / "the".
    const mo = MONTH_RE.exec(s);
    const dm = /\b(\d{1,2})(st|nd|rd|th)?\b/.exec(s.replace(/\b\d{4}\b/, ""));
    if (dm && (mo || dm[2] || /\bthe\b/.test(s))) {
      const day = parseInt(dm[1], 10);
      if (day >= 1 && day <= 31) return { kind: "monthday", month: mo ? MONTH_INDEX[mo[1]] : null, day };
    }
  }
  return null;
}

/** "tomorrow at 6 pm" / "tuesday 6pm" / "6 tonight" — either field may carry the whole phrase. */
function splitDayAndTime(raw: string): { date: ParsedDate | null; time: ParsedTime | null } | null {
  const s = (raw || "").toLowerCase().replace(/[,]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  const hint = (dayPart: string) => (/(tonight|evening|night)/.test(dayPart) ? " pm" : /morning/.test(dayPart) ? " am" : "");
  let m = /^(.*?)\s*\b(?:at|around|about|by)\s+(.+)$/.exec(s);
  if (m) {
    const t = parseTimePhrase(m[2] + hint(m[1]));
    if (t) return { date: m[1] ? parseDatePhrase(m[1]) : null, time: t };
  }
  m = new RegExp(`^((?:next |this |on )?${DAY_WORD}(?: (?:morning|afternoon|evening|night))?)\\s+(.+)$`).exec(s);
  if (m) {
    const t = parseTimePhrase(m[2] + hint(m[1]));
    if (t) return { date: parseDatePhrase(m[1]), time: t };
  }
  m = new RegExp(`^(.+?)\\s+((?:next |this |on )?${DAY_WORD}(?: (?:morning|afternoon|evening|night))?)$`).exec(s);
  if (m) {
    const t = parseTimePhrase(m[1] + hint(m[2]));
    if (t) return { date: parseDatePhrase(m[2]), time: t };
  }
  return null;
}

/* ─────────────────────────────── describing ─────────────────────────────── */

/**
 * "today at 6:00 PM" · "tomorrow, Tuesday, at 6:00 PM" · "Tuesday at 6:00 PM"
 * (within the week) · "Tuesday, August 25, at 6:00 PM" (further out). Local
 * calendar dates decide today/tomorrow (a 00:30 call is "today" for 6 PM the
 * same date), matching context-payload.ts describeNextOpen.
 */
export function describeSlot(dateKey: string, hhmm: string, now: Date, timezone: string | null | undefined, format: "12h" | "24h"): string {
  const time = formatHour(hhmm, format) || hhmm;
  const day = describeDay(dateKey, now, timezone);
  if (day === "today") return `today at ${time}`;
  if (day.startsWith("tomorrow")) return `tomorrow, ${WEEKDAY[dowOfDateKey(dateKey)]}, at ${time}`;
  if (day.includes(",")) return `${day}, at ${time}`;
  return `${day} at ${time}`;
}

/** The day alone: "today" · "tomorrow (Tuesday)" · "Tuesday" · "Tuesday, August 25". */
export function describeDay(dateKey: string, now: Date, timezone: string | null | undefined): string {
  const tz = timezone || "UTC";
  const todayKey = dateKeyOfInstant(now, tz);
  const tomorrowKey = dateKeyOfInstant(new Date(now.getTime() + DAY_MS), tz);
  const dow = dowOfDateKey(dateKey);
  if (dateKey === todayKey) return "today";
  if (dateKey === tomorrowKey) return `tomorrow (${WEEKDAY[dow]})`;
  const daysAhead = Math.round((new Date(`${dateKey}T12:00:00Z`).getTime() - new Date(`${todayKey}T12:00:00Z`).getTime()) / DAY_MS);
  if (daysAhead > 0 && daysAhead < 7) return WEEKDAY[dow];
  const [, mo, d] = dateKey.split("-").map((x) => parseInt(x, 10));
  return `${WEEKDAY[dow]}, ${MONTHS[(mo || 1) - 1]} ${d}`;
}

/* ───────────────────────────── the day's slots ──────────────────────────── */

type DayPlan = {
  dateKey: string;
  /** Delay-shifted intervals of the day itself (holiday custom hours when the day has them). */
  dayIntervals: SlotInterval[];
  /** Delay-shifted intervals of the previous day (overnight spill). */
  prevIntervals: SlotInterval[];
  /** The same two, UNshifted — to tell "outside hours" from "warm-up window". */
  rawDayIntervals: SlotInterval[];
  rawPrevIntervals: SlotInterval[];
  /** Windows the service is CLOSED during on that day (partial-day holiday closure). */
  closedWindows: SlotInterval[];
  /** null = open at some point that day; else why the whole day is out. */
  closedReason: null | { code: "holiday_closed"; name: string | null } | { code: "closed_day" };
  isHolidayHours: boolean;
  step: number;
  modes: SlotMode[];
  /** Earliest offerable minute of the day (0 = whole day; 1440 = none). */
  floorMin: number;
  /** Which floor bit — the message names it. */
  floorReason: null | "prep" | "lead" | "pause";
};

function serviceRow(rules: SlotRules, dow: number, type: ScheduleServiceType): OpeningHoursRow | null {
  // Mirrors the picker + the /api/orders warm-up backstop: delivery reads the
  // delivery rows, everything else the pickup rows, each falling back to the
  // general row when there is no service-scoped one.
  return pickHoursForService(rules.openingHours as unknown as HoursRow[], dow, type === "delivery" ? "delivery" : "pickup") as unknown as OpeningHoursRow | null;
}
const overnightIv = (iv: { open: string; close: string }): SlotInterval => ({ open: iv.open, close: iv.close, closesNextDay: iv.close <= iv.open });

function firstOrderDelayFor(rules: SlotRules, type: ScheduleServiceType): number {
  const v = readServiceSettings(rules.serviceSettings)?.[svcKey(type)]?.firstOrderDelayMinutes;
  return typeof v === "number" && v > 0 ? Math.min(240, Math.floor(v)) : 0;
}
function stepFor(rules: SlotRules, type: ScheduleServiceType): number {
  const v = readServiceSettings(rules.serviceSettings)?.[svcKey(type)]?.slotInterval;
  const raw = typeof v === "number" && v > 0 ? v : rules.scheduledOrderInterval ?? 15;
  return Math.max(5, Math.min(120, raw || 15));
}
function modesFor(rules: SlotRules, type: ScheduleServiceType): SlotMode[] {
  return resolveSlotModes(readServiceSettings(rules.serviceSettings)?.[svcKey(type)]);
}
function minLeadFor(rules: SlotRules, type: ScheduleServiceType): number {
  if (rules.allowScheduledOrders === false) return 0; // /api/orders skips the lead rules when web scheduling is off
  return Math.max(0, type === "delivery" ? rules.deliveryMinLeadMinutes ?? 0 : rules.pickupMinLeadMinutes ?? 0);
}
function maxAdvanceFor(rules: SlotRules, type: ScheduleServiceType): number {
  if (rules.allowScheduledOrders === false) return 0;
  return Math.max(0, type === "delivery" ? rules.deliveryMaxAdvanceDays ?? 0 : rules.pickupMaxAdvanceDays ?? 0);
}
function prepFor(rules: SlotRules, type: ScheduleServiceType): number {
  return Math.max(0, type === "delivery" ? rules.estimatedDelivery ?? 0 : rules.estimatedPickup ?? 0);
}
function pauseEndFor(rules: SlotRules, type: ScheduleServiceType, now: Date): Date | null {
  const raw = type === "delivery" ? rules.deliveryPausedUntil : rules.pickupPausedUntil;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isFinite(d.getTime()) && d.getTime() > now.getTime() ? d : null;
}

/** Minute-of-day of an instant on `dateKey` (0 before the day, 1440 after). */
function minuteOnDay(instant: Date, dateKey: string, tz: string): number {
  const key = dateKeyOfInstant(instant, tz);
  if (key < dateKey) return 0;
  if (key > dateKey) return 24 * 60;
  return toMin(localDowAndHHMM(instant, tz).hhmm);
}

function planDay(rules: SlotRules, type: ScheduleServiceType, dateKey: string, now: Date): DayPlan {
  const tz = rules.timezone || "UTC";
  const dow = dowOfDateKey(dateKey);
  const delay = firstOrderDelayFor(rules, type);
  const svc = canonicalHolidayService(type);
  const eff = holidayEffectForDay(rules.holidays, dateKey, svc);
  const prevEff = holidayEffectForDay(rules.holidays, addDaysToDateKey(dateKey, -1), svc);

  let closedReason: DayPlan["closedReason"] = null;
  let dayIntervals: SlotInterval[] = [];
  let closedWindows: SlotInterval[] = [];
  if (eff?.kind === "closed") {
    closedReason = { code: "holiday_closed", name: eff.name ?? null };
  } else if (eff?.kind === "custom_hours") {
    dayIntervals = eff.intervals.map(overnightIv);
  } else {
    dayIntervals = rowIntervals(serviceRow(rules, dow, type)).map((iv) => ({ ...iv }));
    if (eff?.kind === "closed_windows") closedWindows = eff.intervals.map((iv) => ({ open: iv.open, close: iv.close }));
    if (!dayIntervals.length) closedReason = { code: "closed_day" };
  }
  // The previous day's overnight spill.
  let prevIntervals: SlotInterval[] = [];
  if (prevEff?.kind === "custom_hours") prevIntervals = prevEff.intervals.map(overnightIv);
  else if (prevEff?.kind !== "closed") prevIntervals = rowIntervals(serviceRow(rules, (dow + 6) % 7, type)).map((iv) => ({ ...iv }));
  if (closedReason?.code === "closed_day" && prevIntervals.some((iv) => iv.closesNextDay || iv.close <= iv.open)) {
    // A day with no windows of its own can still take the early-morning spill.
    closedReason = null;
  }

  // Floors: now + prep (the picker's floor on today), now + min lead, a pause end.
  // minuteOnDay yields 0 for a floor that falls on an earlier day, 1440 on a later one.
  let floorMin = 0;
  let floorReason: DayPlan["floorReason"] = null;
  const consider = (instant: Date | null, reason: NonNullable<DayPlan["floorReason"]>) => {
    if (!instant) return;
    const m = minuteOnDay(instant, dateKey, tz);
    if (m > floorMin) {
      floorMin = m;
      floorReason = reason;
    }
  };
  consider(new Date(now.getTime() + prepFor(rules, type) * 60_000), "prep");
  const lead = minLeadFor(rules, type);
  if (lead > 0) consider(new Date(now.getTime() + lead * 60_000), "lead");
  consider(pauseEndFor(rules, type, now), "pause");

  return {
    dateKey,
    dayIntervals: shiftIntervalsForFirstOrderDelay(dayIntervals, delay),
    prevIntervals: shiftIntervalsForFirstOrderDelay(prevIntervals, delay),
    rawDayIntervals: dayIntervals,
    rawPrevIntervals: prevIntervals,
    closedWindows,
    closedReason,
    isHolidayHours: eff?.kind === "custom_hours",
    step: stepFor(rules, type),
    modes: modesFor(rules, type),
    floorMin,
    floorReason,
  };
}

/** The exact slots the checkout picker would list for that day (HH:MM, ascending). */
function slotsOf(plan: DayPlan): string[] {
  if (plan.closedReason) return [];
  const slots = buildDaySlots({ dayIntervals: plan.dayIntervals, prevDayIntervals: plan.prevIntervals, stepMinutes: plan.step, minMinutes: plan.floorMin });
  if (!plan.closedWindows.length) return slots;
  return slots.filter((s) => !hhmmInsideIntervals(s, plan.closedWindows));
}

/** Is this exact minute inside an open window (day side or the previous night's spill)? */
function minuteInsideWindows(day: SlotInterval[], prev: SlotInterval[], closedWindows: SlotInterval[], floorMin: number, hhmm: string): boolean {
  const min = toMin(hhmm);
  if (min < floorMin) return false;
  if (closedWindows.length && hhmmInsideIntervals(hhmm, closedWindows)) return false;
  for (const iv of day) {
    if (iv.open === "24:00") continue; // consumed by a warm-up that crossed midnight — belongs to the next day's spill
    const start = toMin(iv.open);
    const overnight = Boolean(iv.closesNextDay) || toMin(iv.close) <= start;
    if (overnight ? min >= start : min >= start && min < toMin(iv.close)) return true;
  }
  for (const iv of prev) {
    const overnight = Boolean(iv.closesNextDay) || toMin(iv.close) <= toMin(iv.open) || iv.open === "24:00";
    if (!overnight) continue;
    if (min >= (iv.spillFromMin ?? 0) && min < toMin(iv.close)) return true;
  }
  return false;
}

/** The store's open windows for that day, spoken in its format ("11:00 AM – 11:00 PM"). */
function windowsSpoken(ivs: SlotInterval[], format: "12h" | "24h"): string {
  return ivs
    .filter((iv) => iv.open !== "24:00")
    .map((iv) => `${formatHour(iv.open, format)} – ${formatHour(iv.close, format)}`)
    .join(", ");
}

/**
 * The first slot the store WOULD take at/after `from` (and after now), scanning
 * forward day by day — the phone twin of the picker's firstOfferableSlotAtOrAfter.
 */
export function firstOfferableSlot(rules: SlotRules, type: ScheduleServiceType, from: Date, now: Date, maxDays = SCAN_DAYS): { dateKey: string; hhmm: string } | null {
  const tz = rules.timezone || "UTC";
  const start = from.getTime() > now.getTime() ? from : now;
  const startKey = dateKeyOfInstant(start, tz);
  const cap = maxAdvanceFor(rules, type);
  const capMs = cap > 0 ? now.getTime() + cap * DAY_MS + 60_000 : Infinity;
  for (let off = 0; off < maxDays; off++) {
    const dateKey = addDaysToDateKey(startKey, off);
    if (instantOf(dateKey, "00:00", tz).getTime() > capMs) break;
    const plan = planDay(rules, type, dateKey, now);
    const minOnDay = off === 0 ? minuteOnDay(start, dateKey, tz) : 0;
    for (const s of slotsOf(plan)) {
      if (toMin(s) < minOnDay) continue;
      if (instantOf(dateKey, s, tz).getTime() > capMs) return null;
      return { dateKey, hhmm: s };
    }
  }
  return null;
}

/* ──────────────────────────────── resolving ─────────────────────────────── */

export type ResolvedWhen =
  | { ok: true; dateKey: string; hhmm: string; meridiemGuessed: boolean; relative: boolean }
  | { ok: false; code: "bad_when" | "missing_time" | "ambiguous_time"; message: string; candidates?: Array<{ dateKey: string; hhmm: string }> };

/**
 * The caller's day + time → a restaurant-local (dateKey, HH:MM). Weekday names
 * mean the NEXT such day — including today when the time is still ahead
 * ("Tuesday at six" said on Tuesday afternoon). An hour with no a.m./p.m. is
 * settled by `isOpenAt` when given (the only candidate inside opening hours
 * wins; both open → ambiguous; neither → the evening one, so the hours
 * refusal names the real problem).
 */
export function resolveWhen(input: WhenInput, now: Date, timezone: string | null | undefined, isOpenAt?: (dateKey: string, hhmm: string) => boolean): ResolvedWhen {
  const tz = timezone || "UTC";
  const todayKey = dateKeyOfInstant(now, tz);
  const timeRaw = typeof input.time === "string" ? input.time.trim() : "";
  const dateRaw = typeof input.date === "string" ? input.date.trim() : "";

  let pd: ParsedDate | null = dateRaw ? parseDatePhrase(dateRaw) : null;
  let pt: ParsedTime | null = parseTimePhrase(timeRaw);
  // Either field may carry the whole phrase ("tomorrow at 6 pm").
  if (!pt) {
    const fromTime = splitDayAndTime(timeRaw);
    const fromDate = splitDayAndTime(dateRaw);
    if (fromTime?.time) {
      pt = fromTime.time;
      if (fromTime.date && !dateRaw) pd = fromTime.date;
    } else if (fromDate?.time) {
      pt = fromDate.time;
      if (fromDate.date) pd = fromDate.date;
    }
  } else if (!dateRaw && timeRaw) {
    const d = splitDayAndTime(timeRaw)?.date;
    if (d) pd = d;
  }
  // A time put in the day field ("6 pm") with nothing else — take it as today.
  if (dateRaw && !pd) {
    const t = parseTimePhrase(dateRaw);
    if (t) {
      pt = pt ?? t;
      pd = { kind: "today" };
    }
  }
  if (dateRaw && !pd) return { ok: false, code: "bad_when", message: `I couldn't make out which day "${dateRaw}" means — ask the caller to say the day plainly.` };
  if (!pd) pd = { kind: "today" };
  if (!pt) {
    if (!timeRaw) return { ok: false, code: "missing_time", message: `No time was given for ${dateRaw || "that day"} — ask what time they'd like it.` };
    return { ok: false, code: "bad_when", message: `I couldn't make out the time in "${timeRaw}" — ask the caller to say it plainly (for example "six thirty in the evening").` };
  }

  // Relative time — from now, in the restaurant's clock.
  if (pt.kind === "relative") {
    const at = new Date(now.getTime() + pt.minutes * 60_000);
    return { ok: true, dateKey: dateKeyOfInstant(at, tz), hhmm: localDowAndHHMM(at, tz).hhmm, meridiemGuessed: false, relative: true };
  }
  const clockT = pt;

  const dateKeyFor = (p: ParsedDate, hhmmForToday: string): string | null => {
    switch (p.kind) {
      case "today":
        return todayKey;
      case "offset":
        return addDaysToDateKey(todayKey, p.days);
      case "explicit":
        return p.dateKey;
      case "weekday": {
        let delta = (p.dow - dowOfDateKey(todayKey) + 7) % 7;
        if (delta === 0) {
          const stillAhead = hhmmForToday > localDowAndHHMM(now, tz).hhmm;
          if (p.next || !stillAhead) delta = 7;
        }
        return addDaysToDateKey(todayKey, delta);
      }
      case "monthday": {
        const [y, mo] = todayKey.split("-").map((x) => parseInt(x, 10));
        const month = p.month ?? mo - 1;
        let key = `${y}-${pad2(month + 1)}-${pad2(p.day)}`;
        if (key < todayKey) {
          if (p.month === null) {
            const nm = (month + 1) % 12;
            key = `${nm === 0 ? y + 1 : y}-${pad2(nm + 1)}-${pad2(p.day)}`;
          } else {
            key = `${y + 1}-${pad2(month + 1)}-${pad2(p.day)}`;
          }
        }
        const check = new Date(`${key}T12:00:00Z`);
        return Number.isFinite(check.getTime()) && check.getUTCDate() === p.day ? key : null;
      }
    }
  };

  const day = pd;
  const clockHours = clockT.meridiem === null && clockT.h >= 1 && clockT.h <= 11 ? [clockT.h, clockT.h + 12] : [clockT.h];
  const cands = clockHours
    .map((h) => {
      const hhmm = `${pad2(h)}:${pad2(clockT.m)}`;
      const dateKey = dateKeyFor(day, hhmm);
      return dateKey ? { dateKey, hhmm } : null;
    })
    .filter((c): c is { dateKey: string; hhmm: string } => !!c);
  if (!cands.length) return { ok: false, code: "bad_when", message: `"${dateRaw}" isn't a day I can place — ask the caller to say the day plainly.` };
  if (cands.length === 1) return { ok: true, dateKey: cands[0].dateKey, hhmm: cands[0].hhmm, meridiemGuessed: false, relative: false };

  // Which of 6 AM / 6 PM? Only the ones still ahead of now and inside opening hours.
  const viable = cands.filter((c) => instantOf(c.dateKey, c.hhmm, tz).getTime() > now.getTime() && (isOpenAt ? isOpenAt(c.dateKey, c.hhmm) : true));
  if (viable.length === 1) return { ok: true, dateKey: viable[0].dateKey, hhmm: viable[0].hhmm, meridiemGuessed: true, relative: false };
  if (viable.length > 1) {
    return { ok: false, code: "ambiguous_time", message: `${clockT.h} could be ${clockT.h} in the morning or ${clockT.h} in the evening — ask which, in one short question.`, candidates: viable };
  }
  // Neither is offerable — settle on the evening one so the refusal names the real reason.
  const evening = cands[cands.length - 1];
  return { ok: true, dateKey: evening.dateKey, hhmm: evening.hhmm, meridiemGuessed: true, relative: false };
}

/* ─────────────────────────────── validating ─────────────────────────────── */

export function validateScheduledSlot(args: { rules: SlotRules; type: ScheduleServiceType; when: WhenInput; now?: Date }): SlotVerdict {
  const { rules, type } = args;
  const now = args.now ?? new Date();
  const tz = rules.timezone || "UTC";
  const fmt: "12h" | "24h" = rules.hoursFormat === "12h" ? "12h" : "24h";
  const say = (dateKey: string, hhmm: string) => describeSlot(dateKey, hhmm, now, tz, fmt);
  const suggest = (s: { dateKey: string; hhmm: string } | null): SlotSuggestion | undefined => (s ? { scheduledFor: `${s.dateKey}T${s.hhmm}`, spoken: say(s.dateKey, s.hhmm) } : undefined);
  const earliestAfter = (from: Date) => suggest(firstOfferableSlot(rules, type, from, now));
  const todayKey = dateKeyOfInstant(now, tz);
  const tomorrowKey = dateKeyOfInstant(new Date(now.getTime() + DAY_MS), tz);

  if (type === "delivery" ? !rules.acceptsDelivery : !rules.acceptsPickup) {
    return { ok: false, code: "service_not_offered", message: `${svcLabel(type)} isn't offered here.` };
  }

  const plans = new Map<string, DayPlan>();
  const planFor = (dateKey: string) => {
    let p = plans.get(dateKey);
    if (!p) {
      p = planDay(rules, type, dateKey, now);
      plans.set(dateKey, p);
    }
    return p;
  };
  const isOpenAt = (dateKey: string, hhmm: string) => {
    const p = planFor(dateKey);
    return !p.closedReason && minuteInsideWindows(p.dayIntervals, p.prevIntervals, p.closedWindows, p.floorMin, hhmm);
  };

  const when = resolveWhen(args.when, now, tz, isOpenAt);
  if (!when.ok) {
    return {
      ok: false,
      code: when.code,
      message: when.message,
      ...(when.candidates ? { candidates: when.candidates.map((c) => ({ ...c, spoken: say(c.dateKey, c.hhmm) })) } : {}),
    };
  }
  const { dateKey, hhmm } = when;
  const requested = instantOf(dateKey, hhmm, tz);
  const requestedSpoken = say(dateKey, hhmm);
  const okOut = (slotHHMM: string, snapped: boolean): SlotVerdict => {
    const modes = planFor(dateKey).modes;
    return {
      ok: true,
      scheduledFor: `${dateKey}T${slotHHMM}`,
      scheduledStyle: modes.includes("bands") ? "bands" : modes.includes("exact") ? "exact" : "range",
      spoken: say(dateKey, slotHHMM),
      snapped,
      ...(snapped ? { requestedSpoken } : {}),
      meridiemGuessed: when.meridiemGuessed,
      isToday: dateKey === todayKey,
      isTomorrow: dateKey === tomorrowKey,
      dateKey,
      hhmm: slotHHMM,
    };
  };

  // Past.
  if (requested.getTime() <= now.getTime()) {
    return { ok: false, code: "scheduled_in_past", message: `${requestedSpoken} has already passed.`, earliest: earliestAfter(now) };
  }

  // Too far ahead — the /api/orders rule, same arithmetic (now + N days, 1-min tolerance).
  const maxAdv = maxAdvanceFor(rules, type);
  if (maxAdv > 0 && requested.getTime() > now.getTime() + maxAdv * DAY_MS + 60_000) {
    const latestKey = dateKeyOfInstant(new Date(now.getTime() + maxAdv * DAY_MS), tz);
    const latestSpoken = describeDay(latestKey, now, tz);
    return {
      ok: false,
      code: "preorder_too_far",
      message: `That's too far ahead — ${svcLabel(type).toLowerCase()} orders can be placed up to ${maxAdv} day${maxAdv === 1 ? "" : "s"} ahead (until ${latestSpoken}).`,
      latest: { dateKey: latestKey, spoken: latestSpoken, maxDays: maxAdv },
    };
  }

  // Paused service and the requested time is before it resumes.
  const pauseEnd = pauseEndFor(rules, type, now);
  if (pauseEnd && requested.getTime() < pauseEnd.getTime()) {
    const resumesSpoken = say(dateKeyOfInstant(pauseEnd, tz), localDowAndHHMM(pauseEnd, tz).hhmm);
    return { ok: false, code: "service_paused", message: `${svcLabel(type)} is paused right now and resumes ${resumesSpoken}.`, resumesSpoken, earliest: earliestAfter(pauseEnd) };
  }

  const plan = planFor(dateKey);
  const day = describeDay(dateKey, now, tz);

  // Closed that day (holiday or weekly).
  if (plan.closedReason) {
    const fromNextDay = instantOf(addDaysToDateKey(dateKey, 1), "00:00", tz);
    if (plan.closedReason.code === "holiday_closed") {
      const nm = plan.closedReason.name;
      return { ok: false, code: "holiday_closed", message: `We're closed ${day}${nm ? ` (${nm})` : ""}.`, holidayName: nm, earliest: earliestAfter(fromNextDay) };
    }
    return { ok: false, code: "outside_opening_hours", message: `${svcLabel(type)} isn't open ${day}.`, earliest: earliestAfter(fromNextDay) };
  }

  // Inside a partial-day closure.
  if (plan.closedWindows.length && hhmmInsideIntervals(hhmm, plan.closedWindows)) {
    const windows = windowsSpoken(plan.closedWindows, fmt);
    return { ok: false, code: "holiday_closed_windows", message: `${svcLabel(type)} is closed ${windows} ${day}.`, windows, earliest: earliestAfter(requested) };
  }

  // Inside opening hours at all? A miss on the RAW windows is "outside hours";
  // a miss only on the delay-shifted ones is the warm-up window after opening.
  const insideRaw = minuteInsideWindows(plan.rawDayIntervals, plan.rawPrevIntervals, plan.closedWindows, 0, hhmm);
  const insideShifted = minuteInsideWindows(plan.dayIntervals, plan.prevIntervals, plan.closedWindows, 0, hhmm);
  const windows = windowsSpoken(plan.rawDayIntervals, fmt);
  if (!insideRaw) {
    return {
      ok: false,
      code: plan.isHolidayHours ? "holiday_custom_hours" : "outside_opening_hours",
      message: `${svcLabel(type)} isn't open at ${formatHour(hhmm, fmt)} ${day}${windows ? ` — that day it's ${windows}` : ""}.`,
      windows,
      earliest: earliestAfter(requested),
    };
  }
  if (!insideShifted) {
    const e = earliestAfter(requested);
    return {
      ok: false,
      code: "first_order_delay",
      message: `${svcLabel(type)} orders start ${firstOrderDelayFor(rules, type)} minutes after opening${e ? ` — the earliest that day is ${e.spoken}` : ""}.`,
      earliest: e,
    };
  }

  // Too soon: below the day's floor (now + prep on today, min lead, pause end).
  const min = toMin(hhmm);
  if (min < plan.floorMin) {
    const lead = minLeadFor(rules, type);
    const e = earliestAfter(requested);
    const why = plan.floorReason === "lead" && lead > 0 ? `orders need at least ${lead} minutes' notice` : `the kitchen needs about ${prepFor(rules, type)} minutes`;
    return { ok: false, code: "preorder_too_soon", message: `${requestedSpoken} is too soon — ${why}${e ? `; the earliest is ${e.spoken}` : ""}.`, earliest: e };
  }

  // The slot grid (bands / range) — snap up within one step, else name the neighbours.
  if (!plan.modes.includes("exact")) {
    const slots = slotsOf(plan);
    if (!slots.includes(hhmm)) {
      const after = slots.find((s) => toMin(s) > min) ?? null;
      const before = [...slots].reverse().find((s) => toMin(s) < min) ?? null;
      if (after && toMin(after) - min < plan.step) return okOut(after, true);
      const nb = before ? { dateKey, hhmm: before } : null;
      const na = after ? { dateKey, hhmm: after } : firstOfferableSlot(rules, type, requested, now);
      const nearest = [nb ? say(nb.dateKey, nb.hhmm) : null, na ? say(na.dateKey, na.hhmm) : null].filter(Boolean).join(" and ");
      return {
        ok: false,
        code: nb || na ? "slot_not_offered" : "no_slots",
        message: `${formatHour(hhmm, fmt)} isn't one of the ${svcLabel(type).toLowerCase()} times offered ${day}${nearest ? ` — the nearest are ${nearest}` : ""}.`,
        nearestBefore: suggest(nb),
        nearestAfter: suggest(na),
        earliest: suggest(na),
      };
    }
  }

  return okOut(hhmm, false);
}

/* ─────────────────────────────── the sim's rules ────────────────────────── */

/**
 * A minimal, honest rule set for the offline simulator: open every day
 * `open`–`close` for both services, 15-minute bands, no leads/pauses/holidays.
 * The scenario runner pins `now` so "later today" is deterministic.
 */
export function simpleSlotRules(o: { timezone?: string; hoursFormat?: "12h" | "24h"; open?: string; close?: string; step?: number; prepMinutes?: number; maxAdvanceDays?: number; minLeadMinutes?: number } = {}): SlotRules {
  const open = o.open ?? "11:00";
  const close = o.close ?? "23:00";
  const rows: OpeningHoursRow[] = [];
  for (let d = 0; d < 7; d++) rows.push({ dayOfWeek: d, isOpen: true, openTime: open, closeTime: close, closesNextDay: close <= open, service: null });
  return {
    timezone: o.timezone ?? "America/Toronto",
    hoursFormat: o.hoursFormat ?? "12h",
    openingHours: rows,
    holidays: [],
    serviceSettings: null,
    scheduledOrderInterval: o.step ?? 15,
    allowScheduledOrders: true,
    requireScheduledOrders: false,
    pickupMinLeadMinutes: o.minLeadMinutes ?? 0,
    pickupMaxAdvanceDays: o.maxAdvanceDays ?? 0,
    deliveryMinLeadMinutes: o.minLeadMinutes ?? 0,
    deliveryMaxAdvanceDays: o.maxAdvanceDays ?? 0,
    estimatedPickup: o.prepMinutes ?? 20,
    estimatedDelivery: o.prepMinutes ?? 45,
    pickupPausedUntil: null,
    deliveryPausedUntil: null,
    acceptsPickup: true,
    acceptsDelivery: true,
  };
}
