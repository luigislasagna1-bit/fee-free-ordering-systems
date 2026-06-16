import { describe, it, expect } from "vitest";
import { GRACE_DAYS, graceDeadline, daysLeft, dayStamp } from "./dunning";

const DAY = 24 * 60 * 60 * 1000;

describe("dunning grace helpers", () => {
  it("graceDeadline is exactly GRACE_DAYS after the start", () => {
    const start = new Date("2026-06-15T12:00:00.000Z");
    expect(graceDeadline(start).getTime()).toBe(start.getTime() + GRACE_DAYS * DAY);
  });

  describe("daysLeft (countdown)", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");

    it("shows the full window on day 0", () => {
      expect(daysLeft(new Date(now.getTime() + GRACE_DAYS * DAY), now)).toBe(GRACE_DAYS);
    });

    it("decrements by whole days as the deadline approaches", () => {
      expect(daysLeft(new Date(now.getTime() + 9 * DAY), now)).toBe(9);
      expect(daysLeft(new Date(now.getTime() + 1 * DAY), now)).toBe(1);
    });

    it("rounds a partial day UP so 'a few hours left' never reads as 0", () => {
      expect(daysLeft(new Date(now.getTime() + 12 * 60 * 60 * 1000), now)).toBe(1);
      expect(daysLeft(new Date(now.getTime() + 60 * 1000), now)).toBe(1);
    });

    it("is 0 once the deadline is reached or passed (paid features drop)", () => {
      expect(daysLeft(now, now)).toBe(0);
      expect(daysLeft(new Date(now.getTime() - DAY), now)).toBe(0);
    });

    it("clamps to GRACE_DAYS if the deadline is somehow further out", () => {
      expect(daysLeft(new Date(now.getTime() + (GRACE_DAYS + 5) * DAY), now)).toBe(GRACE_DAYS);
    });
  });

  describe("dayStamp (once-per-day idempotency key)", () => {
    it("is the UTC calendar date, stable across the day", () => {
      expect(dayStamp(new Date("2026-06-15T00:00:01.000Z"))).toBe("2026-06-15");
      expect(dayStamp(new Date("2026-06-15T23:59:59.000Z"))).toBe("2026-06-15");
    });

    it("changes when the UTC day rolls over", () => {
      expect(dayStamp(new Date("2026-06-16T00:00:00.000Z"))).toBe("2026-06-16");
    });
  });
});
