import { describe, it, expect } from "vitest";
import { isVisibleNow, visibleWindowsOf, buildVisibilityData } from "./menu-visibility";

// Fixed reference moments, always evaluated with an explicit "UTC" timezone so
// the assertions hold regardless of the machine's local tz.
const TUE_NOON = new Date("2026-06-16T12:00:00Z"); // Tue 12:00
const TUE_16 = new Date("2026-06-16T16:00:00Z");   // Tue 16:00
const SAT_16 = new Date("2026-06-20T16:00:00Z");   // Sat 16:00
const SAT_NOON = new Date("2026-06-20T12:00:00Z"); // Sat 12:00
const MON_0030 = new Date("2026-06-15T00:30:00Z"); // Mon 00:30 (overnight spill target)

describe("legacy single-window visibility (unchanged behaviour)", () => {
  it("no mode → legacy isHidden", () => {
    expect(isVisibleNow({ isHidden: false })).toBe(true);
    expect(isVisibleNow({ isHidden: true })).toBe(false);
  });

  it("hide_from_menu always hides", () => {
    expect(isVisibleNow({ visibilityMode: "hide_from_menu", isHidden: true }, TUE_NOON)).toBe(false);
  });

  it("hide_until respects the moment", () => {
    expect(isVisibleNow({ visibilityMode: "hide_until", visibleUntil: "2026-06-17T00:00:00Z" }, TUE_NOON)).toBe(false);
    expect(isVisibleNow({ visibilityMode: "hide_until", visibleUntil: "2026-06-15T00:00:00Z" }, TUE_NOON)).toBe(true);
  });

  it("show_only_from single window: day + time", () => {
    const e = { visibilityMode: "show_only_from", visibleDays: "[2]", visibleFrom: "10:00", visibleTo: "15:00" };
    expect(isVisibleNow(e, TUE_NOON, "UTC")).toBe(true);   // Tue 12:00 in window
    expect(isVisibleNow(e, TUE_16, "UTC")).toBe(false);    // Tue 16:00 past window
    expect(isVisibleNow(e, SAT_NOON, "UTC")).toBe(false);  // wrong day
  });

  it("show_only_from day-only and time-only forms", () => {
    expect(isVisibleNow({ visibilityMode: "show_only_from", visibleDays: "[2]" }, TUE_16, "UTC")).toBe(true);
    expect(isVisibleNow({ visibilityMode: "show_only_from", visibleFrom: "10:00", visibleTo: "15:00" }, SAT_NOON, "UTC")).toBe(true);
    expect(isVisibleNow({ visibilityMode: "show_only_from", visibleFrom: "10:00", visibleTo: "15:00" }, SAT_16, "UTC")).toBe(false);
  });

  it("show_only_from overnight window spills into the next day", () => {
    // Sun 22:00 → 02:00: Mon 00:30 is still inside the Sunday window.
    const e = { visibilityMode: "show_only_from", visibleDays: "[0]", visibleFrom: "22:00", visibleTo: "02:00" };
    expect(isVisibleNow(e, MON_0030, "UTC")).toBe(true);
    expect(isVisibleNow(e, TUE_NOON, "UTC")).toBe(false);
  });

  it("show_from_until date period", () => {
    const e = { visibilityMode: "show_from_until", visibleStartDate: "2026-06-16T00:00:00Z", visibleEndDate: "2026-06-17T00:00:00Z" };
    expect(isVisibleNow(e, TUE_NOON, "UTC")).toBe(true);
    expect(isVisibleNow(e, SAT_NOON, "UTC")).toBe(false);
  });
});

describe("multi-window visibility (Fabrizio cmr803ovq c)", () => {
  // Fabrizio's exact example: Mon–Thu 10–15 PLUS Fri–Sun 15–20.
  const multi = {
    visibilityMode: "show_only_from",
    visibleDays: "[1,2,3,4]", visibleFrom: "10:00", visibleTo: "15:00", // legacy mirror = window 1
    visibleWindows: [
      { days: [1, 2, 3, 4], from: "10:00", to: "15:00" },
      { days: [5, 6, 0], from: "15:00", to: "20:00" },
    ],
  };

  it("visible when ANY window matches", () => {
    expect(isVisibleNow(multi, TUE_NOON, "UTC")).toBe(true);  // window 1
    expect(isVisibleNow(multi, SAT_16, "UTC")).toBe(true);    // window 2
  });

  it("hidden when NO window matches", () => {
    expect(isVisibleNow(multi, TUE_16, "UTC")).toBe(false);   // Tue 16:00 — between windows
    expect(isVisibleNow(multi, SAT_NOON, "UTC")).toBe(false); // Sat 12:00 — before window 2
  });

  it("visibleWindows supersedes a stale legacy triple", () => {
    // Legacy says Tue-only, list says Sat — the list wins.
    const e = {
      visibilityMode: "show_only_from",
      visibleDays: "[2]", visibleFrom: null, visibleTo: null,
      visibleWindows: [{ days: [6], from: null, to: null }, { days: [0], from: null, to: null }],
    };
    expect(isVisibleNow(e, SAT_NOON, "UTC")).toBe(true);
    expect(isVisibleNow(e, TUE_NOON, "UTC")).toBe(false);
  });

  it("accepts a JSON-string visibleWindows column", () => {
    const e = {
      visibilityMode: "show_only_from",
      visibleWindows: JSON.stringify([{ days: [2] }, { days: [6] }]),
    };
    expect(isVisibleNow(e, TUE_NOON, "UTC")).toBe(true);
    expect(isVisibleNow(e, SAT_NOON, "UTC")).toBe(true);
    expect(isVisibleNow(e, new Date("2026-06-19T12:00:00Z"), "UTC")).toBe(false); // Fri
  });

  it("junk windows are dropped; junk-only list falls back to legacy triple", () => {
    const e = {
      visibilityMode: "show_only_from",
      visibleDays: "[2]",
      visibleWindows: [{ days: [] }, { nonsense: true }, null],
    };
    expect(visibleWindowsOf(e)).toEqual([{ days: [2], from: null, to: null }]);
    expect(isVisibleNow(e, TUE_NOON, "UTC")).toBe(true);
  });

  it("multi-window with an overnight second window", () => {
    const e = {
      visibilityMode: "show_only_from",
      visibleWindows: [
        { days: [2], from: "10:00", to: "15:00" },
        { days: [0], from: "22:00", to: "02:00" }, // Sun late → Mon 02:00
      ],
    };
    expect(isVisibleNow(e, MON_0030, "UTC")).toBe(true); // spill from Sunday
    expect(isVisibleNow(e, TUE_NOON, "UTC")).toBe(true);
    expect(isVisibleNow(e, SAT_NOON, "UTC")).toBe(false);
  });

  it("visibleWindowsOf: unrestricted entity → []", () => {
    expect(visibleWindowsOf({})).toEqual([]);
    expect(visibleWindowsOf({ visibleDays: null, visibleFrom: null, visibleTo: null })).toEqual([]);
  });
});

describe("buildVisibilityData with extraWindows (cmr803ovq c)", () => {
  it("primary + extras persist; window[0] mirrors into the legacy columns", () => {
    const r = buildVisibilityData({
      mode: "show_only_from",
      days: [1, 2, 3, 4], from: "10:00", to: "15:00",
      extraWindows: [{ days: [5, 6, 0], from: "15:00", to: "20:00" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.visibleDays).toBe("[1,2,3,4]");
    expect(r.data.visibleFrom).toBe("10:00");
    expect(r.data.visibleTo).toBe("15:00");
    expect(r.data.visibleWindows).toEqual([
      { days: [1, 2, 3, 4], from: "10:00", to: "15:00" },
      { days: [0, 5, 6], from: "15:00", to: "20:00" },
    ]);
  });

  it("single window → visibleWindows null (bit-identical to historic rows)", () => {
    const r = buildVisibilityData({ mode: "show_only_from", days: [2], from: "10:00", to: "15:00" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.visibleWindows).toBeNull();
    expect(r.data.visibleDays).toBe("[2]");
  });

  it("empty/junk extras collapse back to a single window (null list)", () => {
    const r = buildVisibilityData({
      mode: "show_only_from", days: [2],
      extraWindows: [{ days: [], from: null, to: null }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.visibleWindows).toBeNull();
  });

  it("empty primary is skipped; first extra becomes the legacy mirror", () => {
    const r = buildVisibilityData({
      mode: "show_only_from", days: null, from: null, to: null,
      extraWindows: [{ days: [6], from: "15:00", to: "20:00" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.visibleDays).toBe("[6]");
    expect(r.data.visibleFrom).toBe("15:00");
    expect(r.data.visibleWindows).toBeNull(); // one real window
  });

  it("all other modes + always-visible clear visibleWindows to null", () => {
    for (const input of [
      null,
      { mode: "hide_from_menu" },
      { mode: "hide_until", until: "2026-06-17T00:00" },
      { mode: "show_from_until", startDate: "2026-06-16T00:00", endDate: "2026-06-17T00:00" },
    ] as const) {
      const r = buildVisibilityData(input as any);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.visibleWindows).toBeNull();
    }
  });

  it("keeps the historic validation errors", () => {
    expect(buildVisibilityData({ mode: "bogus" }).ok).toBe(false);
    expect(buildVisibilityData({ mode: "show_only_from", from: "10:00" }).ok).toBe(false); // half a time window
    expect(buildVisibilityData({ mode: "show_only_from", from: "25:00", to: "26:00" }).ok).toBe(false);
    expect(buildVisibilityData({ mode: "show_only_from", days: [] }).ok).toBe(false); // every day deselected
    expect(buildVisibilityData({ mode: "show_only_from" }).ok).toBe(false); // no restriction at all
    expect(buildVisibilityData({ mode: "hide_until" }).ok).toBe(false); // missing date
    expect(buildVisibilityData({ mode: "show_from_until", startDate: "2026-06-17T00:00", endDate: "2026-06-16T00:00" }).ok).toBe(false); // end before start
  });

  it("round-trip: built data evaluates correctly through isVisibleNow", () => {
    const r = buildVisibilityData({
      mode: "show_only_from",
      days: [1, 2, 3, 4], from: "10:00", to: "15:00",
      extraWindows: [{ days: [5, 6, 0], from: "15:00", to: "20:00" }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const row = r.data as any;
    expect(isVisibleNow(row, TUE_NOON, "UTC")).toBe(true);
    expect(isVisibleNow(row, TUE_16, "UTC")).toBe(false);
    expect(isVisibleNow(row, SAT_16, "UTC")).toBe(true);
    expect(isVisibleNow(row, SAT_NOON, "UTC")).toBe(false);
  });
});
