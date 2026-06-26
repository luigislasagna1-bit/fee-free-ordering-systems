import { describe, it, expect } from "vitest";
import {
  canonicalHolidayService,
  parseHolidayRules,
  holidayEffectForDay,
  hhmmInsideIntervals,
  holidayWindowOutsideService,
} from "@/lib/holiday-rules";

describe("canonicalHolidayService", () => {
  it("maps order types to canonical service keys", () => {
    expect(canonicalHolidayService("dine-in")).toBe("dine_in");
    expect(canonicalHolidayService("takeout")).toBe("take_out");
    expect(canonicalHolidayService("reservations")).toBe("reservation");
    expect(canonicalHolidayService("delivery")).toBe("delivery");
    expect(canonicalHolidayService("")).toBe("pickup");
  });
});

describe("parseHolidayRules", () => {
  it("returns null for legacy/empty/bad input", () => {
    expect(parseHolidayRules(null)).toBe(null);
    expect(parseHolidayRules("notjson")).toBe(null);
    expect(parseHolidayRules("{}")).toBe(null);
  });
  it("parses an all-services closed rule", () => {
    const r = parseHolidayRules('[{"mode":"closed"}]');
    expect(r?.[0].mode).toBe("closed");
    expect(r?.[0].services).toBe(null);
  });
  it("treats an open rule with no valid intervals as closed (fail safe)", () => {
    expect(parseHolidayRules('[{"mode":"open","intervals":[]}]')?.[0].mode).toBe("closed");
  });
  it("keeps a valid open rule with intervals", () => {
    const r = parseHolidayRules('[{"mode":"open","services":["delivery"],"intervals":[{"open":"10:00","close":"14:00"}]}]');
    expect(r?.[0].mode).toBe("open");
    expect(r?.[0].services).toEqual(["delivery"]);
    expect(r?.[0].intervals).toEqual([{ open: "10:00", close: "14:00" }]);
  });
  it("KEEPS a cross-midnight closed-window interval (no longer silently dropped)", () => {
    const r = parseHolidayRules('[{"mode":"closed_windows","services":["pickup"],"intervals":[{"open":"22:00","close":"02:00"}]}]');
    expect(r?.[0].mode).toBe("closed_windows");
    expect(r?.[0].intervals).toEqual([{ open: "22:00", close: "02:00" }]);
  });
  it("drops only a zero-length (open===close) interval", () => {
    // closed_windows with only an invalid interval → rule dropped (fail open)
    expect(parseHolidayRules('[{"mode":"closed_windows","intervals":[{"open":"12:00","close":"12:00"}]}]')).toBe(null);
  });
});

describe("holidayEffectForDay — specificity resolution", () => {
  const day = "2026-12-25";
  it("returns null outside the date range", () => {
    expect(holidayEffectForDay([{ date: day, rules: null }], "2026-12-24", null)).toBe(null);
  });
  it("treats a legacy (rules=null) row as closed for all services", () => {
    expect(holidayEffectForDay([{ date: day, name: "Christmas", rules: null }], day, "pickup")?.kind).toBe("closed");
  });
  it("lets a service-specific rule beat an all-services rule", () => {
    const holidays = [{
      date: day,
      rules: JSON.stringify([
        { mode: "open", intervals: [{ open: "10:00", close: "14:00" }] },
        { mode: "closed", services: ["delivery"] },
      ]),
    }];
    expect(holidayEffectForDay(holidays, day, "delivery")?.kind).toBe("closed");
    expect(holidayEffectForDay(holidays, day, "pickup")?.kind).toBe("custom_hours");
  });
  it("only honours all-services rules for the general (service=null) status", () => {
    const holidays = [{ date: day, rules: JSON.stringify([{ mode: "closed", services: ["delivery"] }]) }];
    expect(holidayEffectForDay(holidays, day, null)).toBe(null);
  });
});

describe("hhmmInsideIntervals", () => {
  it("checks membership, with exclusive close", () => {
    const ivs = [{ open: "10:00", close: "14:00" }, { open: "17:00", close: "21:00" }];
    expect(hhmmInsideIntervals("12:00", ivs)).toBe(true);
    expect(hhmmInsideIntervals("15:00", ivs)).toBe(false);
    expect(hhmmInsideIntervals("21:00", ivs)).toBe(false);
  });
  it("handles a cross-midnight window (22:00–02:00)", () => {
    const ivs = [{ open: "22:00", close: "02:00" }];
    expect(hhmmInsideIntervals("23:30", ivs)).toBe(true);  // after open
    expect(hhmmInsideIntervals("01:00", ivs)).toBe(true);  // before close (next morning)
    expect(hhmmInsideIntervals("02:00", ivs)).toBe(false); // exclusive close
    expect(hhmmInsideIntervals("12:00", ivs)).toBe(false); // midday outside
  });
});

describe("holidayWindowOutsideService — exceptional hours must fit service hours", () => {
  const pickup = [{ open: "09:00", close: "23:00" }];            // 9am–11pm, no wrap
  const general = [{ open: "10:00", close: "03:00" }];           // 10am–3am, wraps
  it("accepts a same-day window inside the service hours", () => {
    expect(holidayWindowOutsideService([{ open: "13:00", close: "15:00" }], pickup)).toBe(null);
  });
  it("rejects a window that exceeds the service hours (Luigi's case: pickup 10pm–2am)", () => {
    const bad = holidayWindowOutsideService([{ open: "22:00", close: "02:00" }], pickup);
    expect(bad).toEqual({ open: "22:00", close: "02:00" });
  });
  it("accepts the same window when the service itself crosses midnight (general 10am–3am)", () => {
    expect(holidayWindowOutsideService([{ open: "22:00", close: "02:00" }], general)).toBe(null);
  });
  it("recognises an early-morning window inside an overnight service span", () => {
    expect(holidayWindowOutsideService([{ open: "01:00", close: "02:00" }], general)).toBe(null);
  });
  it("rejects everything when the service is closed that day", () => {
    expect(holidayWindowOutsideService([{ open: "13:00", close: "14:00" }], [])).toEqual({ open: "13:00", close: "14:00" });
  });
});
