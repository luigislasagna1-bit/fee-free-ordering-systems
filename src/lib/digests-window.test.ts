/**
 * The business-day boundary — the maths behind Fabrizio's cms0gyexp #13.
 *
 * `operationalDayEnd` decides two things at once: WHEN the end-of-day report is
 * emailed (the cron fires ~5 min after this instant) and WHICH activity the
 * report contains (the window ends here). If they ever disagree, the report
 * either misses the evening or re-reports it the next morning — which is exactly
 * what Fabrizio saw: a 23:53 booking after a 23:00 close landed in the 30th and
 * produced a 10:01 AM email.
 *
 * These are pure and exported, and until now had no test at all in a lib with
 * 50+ sibling *.test.ts files.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {} }));

import { operationalDayEnd, type DigestHoursRow, type HolidayRowLike } from "./digests";

const TZ = "Europe/Rome"; // Fabrizio's timezone
const THU = "2026-07-30"; // the day he reported on — a Thursday

/** A weekly row for one weekday. dow 4 = Thursday. */
function row(partial: Partial<DigestHoursRow> = {}): DigestHoursRow {
  return {
    dayOfWeek: 4,
    isOpen: true,
    openTime: "12:00",
    closeTime: "23:00",
    closesNextDay: false,
    service: null,
    ...partial,
  };
}

/** Local wall-clock reading of an instant, in the restaurant's timezone. */
const localTime = (d: Date) =>
  d.toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const localDate = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

describe("operationalDayEnd — when the business day ends", () => {
  it("ends at the configured close (Fabrizio's Thursday 12:00-23:00)", () => {
    const end = operationalDayEnd([row()], THU, TZ);
    expect(localTime(end)).toBe("23:00");
    expect(localDate(end)).toBe(THU);
  });

  it("with SPLIT hours it ends at the LAST close, never the first", () => {
    // 11:00-15:00 and 20:00-23:00 — his own example.
    const split = row({
      intervals: [
        { open: "11:00", close: "15:00" },
        { open: "20:00", close: "23:00" },
      ],
    });
    const end = operationalDayEnd([split], THU, TZ);
    expect(localTime(end), "the report must not fire at the lunch close").toBe("23:00");
  });

  it("an overnight close lands on the NEXT calendar day", () => {
    const overnight = row({
      intervals: [{ open: "20:00", close: "01:00", closesNextDay: true }],
    });
    const end = operationalDayEnd([overnight], THU, TZ);
    expect(localTime(end)).toBe("01:00");
    expect(localDate(end)).toBe("2026-07-31");
  });

  it("a closed day ends at midnight, so windows still chain without a gap", () => {
    const end = operationalDayEnd([row({ isOpen: false, openTime: null, closeTime: null })], THU, TZ);
    expect(localDate(end)).toBe("2026-07-31");
    expect(localTime(end)).toBe("00:00");
  });

  it("no hours configured at all falls back to midnight rather than throwing", () => {
    const end = operationalDayEnd([], THU, TZ);
    expect(localTime(end)).toBe("00:00");
  });
});

describe("operationalDayEnd — special days override the weekly row", () => {
  const holiday = (rules: unknown): HolidayRowLike[] => [
    { date: THU, endDate: null, name: "Special", message: null, rules: JSON.stringify(rules) },
  ];

  it("custom holiday hours move the close (12:00-18:00 reports at 18:00, not 23:00)", () => {
    const end = operationalDayEnd(
      [row()],
      THU,
      TZ,
      holiday([{ mode: "open", intervals: [{ open: "12:00", close: "18:00" }] }]),
    );
    expect(localTime(end), "a special day must not report at the normal close").toBe("18:00");
  });

  it("takes the LAST interval when a special day is also split", () => {
    const end = operationalDayEnd(
      [row()],
      THU,
      TZ,
      holiday([{ mode: "open", intervals: [{ open: "10:00", close: "13:00" }, { open: "17:00", close: "20:00" }] }]),
    );
    expect(localTime(end)).toBe("20:00");
  });

  it("a full closure ends at midnight even though the weekly row says 23:00", () => {
    const end = operationalDayEnd([row()], THU, TZ, holiday([{ mode: "closed" }]));
    expect(localDate(end)).toBe("2026-07-31");
    expect(localTime(end)).toBe("00:00");
  });

  it("a holiday on a DIFFERENT date is ignored", () => {
    const other: HolidayRowLike[] = [
      { date: "2026-12-25", endDate: null, name: "Christmas", message: null, rules: JSON.stringify([{ mode: "closed" }]) },
    ];
    expect(localTime(operationalDayEnd([row()], THU, TZ, other))).toBe("23:00");
  });
});

describe("Fabrizio's reported case", () => {
  it("a booking made at 23:53 after a 23:00 close is OUTSIDE the 30th's window", () => {
    // The 30th's window is [end of the 29th, end of the 30th).
    const end30 = operationalDayEnd([row()], THU, TZ);
    // 23:53 local on the 30th = 21:53 UTC (CEST is UTC+2).
    const booking = new Date("2026-07-30T21:53:00Z");
    expect(booking.getTime() >= end30.getTime(), "#KYDENB must not be counted in the 30th").toBe(true);
  });

  it("consecutive days chain with no gap and no overlap", () => {
    const wed = row({ dayOfWeek: 3 });
    const thu = row({ dayOfWeek: 4 });
    const rows = [wed, thu];
    const endWed = operationalDayEnd(rows, "2026-07-29", TZ);
    const endThu = operationalDayEnd(rows, THU, TZ);
    // The 30th's window starts exactly where the 29th ended — an order can
    // never fall between two windows, nor be counted in both.
    expect(endWed.getTime()).toBeLessThan(endThu.getTime());
    expect(localTime(endWed)).toBe("23:00");
  });
});
