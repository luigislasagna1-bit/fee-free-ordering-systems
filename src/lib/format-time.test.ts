import { describe, it, expect } from "vitest";
import { formatTime, formatDueCountdown, formatDueLabel, formatMinutes, formatDateCapitalized } from "@/lib/format-time";

describe("formatTime — 12h/24h, with the midnight fix", () => {
  it("formats 24h", () => {
    expect(formatTime("14:30", "24h")).toBe("14:30");
    expect(formatTime("09:05", "24h")).toBe("09:05");
  });
  it("formats 12h with correct AM/PM — midnight is 12:00 AM, not 0:00", () => {
    expect(formatTime("14:30", "12h")).toBe("2:30 PM");
    expect(formatTime("00:00", "12h")).toBe("12:00 AM"); // the bug: must NOT be "0:00 AM"
    expect(formatTime("12:00", "12h")).toBe("12:00 PM"); // noon
    expect(formatTime("00:30", "12h")).toBe("12:30 AM");
  });
  it("returns empty string for null or garbage", () => {
    expect(formatTime("")).toBe("");
    expect(formatTime(null)).toBe("");
    expect(formatTime("notatime")).toBe("");
  });
});

describe("formatDueCountdown — unambiguous kitchen countdown (Fabrizio fix)", () => {
  it("carries explicit unit suffixes so hours can't be misread as minutes", () => {
    expect(formatDueCountdown(2 * 3600_000 + 5 * 60_000)).toEqual({ text: "2h 05m", unit: "hours" });
    expect(formatDueCountdown(14 * 60_000 + 31 * 1000)).toEqual({ text: "14m 31s", unit: "minutes" });
    expect(formatDueCountdown(45 * 1000)).toEqual({ text: "45s", unit: "minutes" });
  });
  it("shows 00:00 / due when at or past the due time", () => {
    expect(formatDueCountdown(0)).toEqual({ text: "00:00", unit: "due" });
    expect(formatDueCountdown(-5000)).toEqual({ text: "00:00", unit: "due" });
  });
});

describe("formatDueLabel — caps the countdown at 24h", () => {
  const now = 1_000_000_000_000;
  it("delegates to the countdown within 24h", () => {
    expect(formatDueLabel(now + 2 * 3600_000, now)).toEqual({ text: "2h 00m", kind: "hours" });
  });
  it("shows a weekday name when more than 24h out", () => {
    const r = formatDueLabel(now + 3 * 24 * 3600_000, now);
    expect(r.kind).toBe("day");
    expect(r.text.length).toBeGreaterThan(0);
  });
});

describe("formatMinutes — minutes-since-midnight", () => {
  it("formats honoring 12h/24h", () => {
    expect(formatMinutes(870, "24h")).toBe("14:30");
    expect(formatMinutes(870, "12h")).toBe("2:30 PM");
    expect(formatMinutes(0, "12h")).toBe("12:00 AM");
  });
  it("clamps out-of-range values and ignores junk", () => {
    expect(formatMinutes(null)).toBe("");
    expect(formatMinutes(2000, "24h")).toBe("24:00"); // clamped to 1440
  });
});

describe("formatDateCapitalized", () => {
  const d = new Date(Date.UTC(2026, 6, 15, 15, 0)); // Wed 15 Jul 2026, 15:00 UTC
  const opts: Intl.DateTimeFormatOptions = {
    weekday: "long", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
  };

  it("capitalises the Italian weekday + month (Fabrizio 2026-07-15)", () => {
    // Italian renders these lowercase: "mercoledì 15 lug, 15:00"
    expect(formatDateCapitalized(d, "it", opts)).toBe("Mercoledì 15 Lug, 15:00");
  });

  it("leaves already-capitalised English alone", () => {
    expect(formatDateCapitalized(d, "en", opts)).toBe("Wednesday, Jul 15, 15:00");
  });

  it("does not mangle non-cased scripts (ja)", () => {
    const out = formatDateCapitalized(d, "ja", opts);
    expect(out).toContain("15");
    expect(out.length).toBeGreaterThan(0);
  });

  it("never throws on a bad locale", () => {
    expect(() => formatDateCapitalized(d, "not-a-locale", opts)).not.toThrow();
  });
});
