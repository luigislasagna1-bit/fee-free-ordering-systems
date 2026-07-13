import { describe, it, expect, vi } from "vitest";
// menu-schedule.ts imports the Prisma client at module load (for the async
// resolveScheduledMenuId); the PURE helpers under test don't touch it, so mock
// the db module to avoid a DATABASE_URL requirement in the unit runner.
vi.mock("@/lib/db", () => ({ default: {} }));
import { parseMenuWindows, expandMenuWindows, anyMenuWindowed, pickMenuAt, findCoverageGaps, toMinutes, type MenuWindow } from "./menu-schedule";

/**
 * Multiple daily windows per menu (Fabrizio cmrjb8voz, 2026-07-13): a menu can
 * be the live one during more than one time band per day. The pure resolvers
 * (pickMenuAt / findCoverageGaps) work over an EXPANDED window list, so a
 * multi-window menu contributes several entries that share its id.
 */

const raw = (id: string, name: string, over: Partial<{ availableWindows: string | null; availableDays: string | null; availableFrom: string | null; availableTo: string | null }> = {}) => ({
  id, name, availableWindows: null, availableDays: null, availableFrom: null, availableTo: null, ...over,
});

describe("parseMenuWindows", () => {
  it("parses a valid multi-window JSON, normalising days", () => {
    const ws = parseMenuWindows(JSON.stringify([
      { from: "11:00", to: "15:00", days: [1, 2, 3] },
      { from: "18:00", to: "22:00" }, // no days = every day → null
    ]));
    expect(ws).toEqual([
      { from: "11:00", to: "15:00", days: [1, 2, 3] },
      { from: "18:00", to: "22:00", days: null },
    ]);
  });
  it("drops windows with a bad time or from===to, and returns [] for junk", () => {
    expect(parseMenuWindows(JSON.stringify([{ from: "9:00", to: "10:00" }]))).toEqual([]); // 9:00 not HH:MM
    expect(parseMenuWindows(JSON.stringify([{ from: "10:00", to: "10:00" }]))).toEqual([]);
    expect(parseMenuWindows("not json")).toEqual([]);
    expect(parseMenuWindows(null)).toEqual([]);
    expect(parseMenuWindows("[]")).toEqual([]);
  });
  it("treats all-7-days as no restriction (null)", () => {
    const ws = parseMenuWindows(JSON.stringify([{ from: "10:00", to: "14:00", days: [0, 1, 2, 3, 4, 5, 6] }]));
    expect(ws[0].days).toBeNull();
  });
});

describe("expandMenuWindows", () => {
  it("expands a multi-window menu into one entry per window (same id)", () => {
    const entries = expandMenuWindows(raw("m1", "Lunch/Late", { availableWindows: JSON.stringify([
      { from: "11:00", to: "15:00", days: null }, { from: "18:00", to: "22:00", days: null },
    ]) }));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.id === "m1")).toBe(true);
    expect(entries.map((e) => `${e.from}-${e.to}`)).toEqual(["11:00-15:00", "18:00-22:00"]);
  });
  it("falls back to the legacy single window", () => {
    const entries = expandMenuWindows(raw("m2", "Dinner", { availableFrom: "17:00", availableTo: "23:00" }));
    expect(entries).toHaveLength(1);
    expect(entries[0].from).toBe("17:00");
  });
  it("a menu with no window becomes a single all-hours default entry", () => {
    const entries = expandMenuWindows(raw("m3", "Main"));
    expect(entries).toHaveLength(1);
    expect(entries[0].from).toBeNull();
    expect(entries[0].to).toBeNull();
  });
});

describe("anyMenuWindowed", () => {
  it("true when a menu uses a multi-window list", () => {
    expect(anyMenuWindowed([raw("a", "A"), raw("b", "B", { availableWindows: JSON.stringify([{ from: "10:00", to: "12:00" }]) })])).toBe(true);
  });
  it("true for a legacy single window, false when none", () => {
    expect(anyMenuWindowed([raw("a", "A", { availableFrom: "10:00", availableTo: "12:00" })])).toBe(true);
    expect(anyMenuWindowed([raw("a", "A"), raw("b", "B")])).toBe(false);
  });
});

describe("pickMenuAt with multi-window menus", () => {
  // Multi-window "Lunch/Late" (11–15 & 18–22) + an all-hours "Main" default.
  const menus = [
    ...expandMenuWindows(raw("lunchlate", "Lunch/Late", { availableWindows: JSON.stringify([
      { from: "11:00", to: "15:00", days: null }, { from: "18:00", to: "22:00", days: null },
    ]) }), false),
    ...expandMenuWindows(raw("main", "Main"), true),
  ];
  const at = (hhmm: string) => pickMenuAt(menus, 3 /* Wed */, toMinutes(hhmm));

  it("serves the windowed menu inside EITHER band", () => {
    expect(at("12:00")).toBe("lunchlate"); // inside band 1
    expect(at("20:00")).toBe("lunchlate"); // inside band 2
  });
  it("serves the default menu in the gap between bands and outside all bands", () => {
    expect(at("16:00")).toBe("main"); // between the two bands
    expect(at("09:00")).toBe("main"); // before band 1
    expect(at("23:00")).toBe("main"); // after band 2
  });
});

describe("findCoverageGaps with multi-window menus", () => {
  // Open Wed 10:00–22:00; a single multi-window menu covering 10–14 & 16–22.
  const open = [{ dow: 3, start: toMinutes("10:00"), end: toMinutes("22:00") }];
  const windows: MenuWindow[] = expandMenuWindows(raw("m", "M", { availableWindows: JSON.stringify([
    { from: "10:00", to: "14:00", days: null }, { from: "16:00", to: "22:00", days: null },
  ]) }));

  it("reports the uncovered stretch between the two windows", () => {
    const gaps = findCoverageGaps(open, windows);
    expect(gaps).toEqual([{ dow: 3, dayLabel: "Wed", from: "14:00", to: "16:00" }]);
  });
  it("no gap once a second window fills it", () => {
    const filled = expandMenuWindows(raw("m", "M", { availableWindows: JSON.stringify([
      { from: "10:00", to: "16:00", days: null }, { from: "16:00", to: "22:00", days: null },
    ]) }));
    expect(findCoverageGaps(open, filled)).toEqual([]);
  });
});
