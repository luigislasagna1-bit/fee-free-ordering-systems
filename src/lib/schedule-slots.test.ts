import { describe, it, expect } from "vitest";
import { buildDaySlots, shiftIntervalsForFirstOrderDelay } from "./schedule-slots";

/**
 * Overnight-correct slot generation (Luigi 2026-07-04): at 1:50 AM with
 * 10:00 – 03:00 (next day) hours, the checkout offered PAST times (1:15 AM)
 * and times inside the prep window, because an overnight window's
 * post-midnight part was wrapped back onto the same date via `% 24`.
 * These tests pin the corrected model.
 */
const OVERNIGHT = [{ open: "10:00", close: "03:00", closesNextDay: true }];
const NORMAL = [{ open: "09:00", close: "23:00", closesNextDay: false }];

describe("buildDaySlots", () => {
  it("Luigi's regression: 1:50 AM + 45 min prep, overnight hours — no past or too-early times", () => {
    // "Today" 1:50 AM, delivery prep 45 → earliest offerable = 2:35 (155).
    const slots = buildDaySlots({
      dayIntervals: OVERNIGHT,
      prevDayIntervals: OVERNIGHT,
      stepMinutes: 15,
      minMinutes: 155,
    });
    // Only the tail of last night's spill (2:45), then today's evening run.
    expect(slots[0]).toBe("02:45");
    expect(slots).not.toContain("01:15"); // the exact past time Luigi saw offered
    expect(slots).not.toContain("02:15"); // inside the prep window
    expect(slots[1]).toBe("10:00");
    // Post-midnight portion of TODAY's own window belongs to tomorrow, not today.
    expect(slots.filter((s) => s < "03:00")).toEqual(["02:45"]);
    expect(slots[slots.length - 1]).toBe("23:45");
  });

  it("future date with overnight hours: full spill + own window clipped at midnight", () => {
    const slots = buildDaySlots({
      dayIntervals: OVERNIGHT,
      prevDayIntervals: OVERNIGHT,
      stepMinutes: 30,
      minMinutes: 0,
    });
    // Spill from the previous night: 00:00 → 02:30 (close 03:00, step 30).
    expect(slots.slice(0, 6)).toEqual(["00:00", "00:30", "01:00", "01:30", "02:00", "02:30"]);
    // Own window starts at 10:00 and is clipped at midnight (last = 23:30).
    expect(slots[6]).toBe("10:00");
    expect(slots[slots.length - 1]).toBe("23:30");
    // Nothing between 03:00 and 10:00 (closed gap preserved).
    expect(slots.some((s) => s >= "03:00" && s < "10:00")).toBe(false);
  });

  it("normal (non-overnight) hours behave exactly as before — no spill", () => {
    const slots = buildDaySlots({
      dayIntervals: NORMAL,
      prevDayIntervals: NORMAL,
      stepMinutes: 15,
      minMinutes: 0,
    });
    expect(slots[0]).toBe("09:00");
    expect(slots[slots.length - 1]).toBe("22:45");
    expect(slots.some((s) => s < "09:00")).toBe(false);
  });

  it("split hours (lunch + dinner) keep their gap; overnight dinner clips at midnight", () => {
    const slots = buildDaySlots({
      dayIntervals: [
        { open: "11:00", close: "14:00", closesNextDay: false },
        { open: "17:00", close: "01:00", closesNextDay: true },
      ],
      prevDayIntervals: [],
      stepMinutes: 60,
      minMinutes: 0,
    });
    expect(slots).toEqual(["11:00", "12:00", "13:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"]);
  });

  it("closed previous day contributes no spill", () => {
    const slots = buildDaySlots({
      dayIntervals: OVERNIGHT,
      prevDayIntervals: [], // closed yesterday
      stepMinutes: 15,
      minMinutes: 0,
    });
    expect(slots[0]).toBe("10:00");
  });

  it("legacy overnight rows without closesNextDay flag (close <= open) still spill", () => {
    const slots = buildDaySlots({
      dayIntervals: [{ open: "10:00", close: "02:00" }],
      prevDayIntervals: [{ open: "10:00", close: "02:00" }],
      stepMinutes: 30,
      minMinutes: 0,
    });
    expect(slots.slice(0, 3)).toEqual(["00:00", "00:30", "01:00"]);
    expect(slots[4]).toBe("10:00");
  });
});

/**
 * "First scheduled order after opening" (Luigi 2026-08-10): a customer could
 * book the exact opening minute (10:00 delivery at a 10:00-opening store).
 * The per-service delay shifts every window's OPEN; picker, defaults and the
 * server backstop all consume this one helper.
 */
describe("shiftIntervalsForFirstOrderDelay", () => {
  it("Luigi's case: 10:00 open + 30 min delay → first offerable slot 10:30", () => {
    const shifted = shiftIntervalsForFirstOrderDelay([{ open: "10:00", close: "22:00" }], 30);
    expect(shifted).toEqual([{ open: "10:30", close: "22:00" }]);
    const slots = buildDaySlots({ dayIntervals: shifted, prevDayIntervals: [], stepMinutes: 15, minMinutes: 0 });
    expect(slots[0]).toBe("10:30");
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:15");
  });

  it("0 delay is identity (the default: nothing changes for existing stores)", () => {
    const ivs = [{ open: "10:00", close: "22:00" }];
    expect(shiftIntervalsForFirstOrderDelay(ivs, 0)).toBe(ivs);
  });

  it("delay applies PER WINDOW on split hours (lunch and dinner each warm up)", () => {
    const shifted = shiftIntervalsForFirstOrderDelay(
      [{ open: "11:00", close: "14:00" }, { open: "17:00", close: "22:00" }],
      45,
    );
    expect(shifted).toEqual([
      { open: "11:45", close: "14:00" },
      { open: "17:45", close: "22:00" },
    ]);
  });

  it("a window fully consumed by the delay is dropped, not inverted", () => {
    const shifted = shiftIntervalsForFirstOrderDelay(
      [{ open: "11:00", close: "11:30" }, { open: "17:00", close: "22:00" }],
      60,
    );
    expect(shifted).toEqual([{ open: "18:00", close: "22:00" }]);
  });

  it("overnight window keeps its spill; the delay burdens the evening opening", () => {
    const shifted = shiftIntervalsForFirstOrderDelay(
      [{ open: "18:00", close: "02:00", closesNextDay: true }],
      30,
    );
    expect(shifted).toEqual([{ open: "18:30", close: "02:00", closesNextDay: true }]);
  });

  it("negative and NaN delays are treated as 0", () => {
    const ivs = [{ open: "10:00", close: "22:00" }];
    expect(shiftIntervalsForFirstOrderDelay(ivs, -15)).toBe(ivs);
    expect(shiftIntervalsForFirstOrderDelay(ivs, NaN as unknown as number)).toBe(ivs);
  });
});
