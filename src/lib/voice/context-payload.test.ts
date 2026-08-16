/**
 * describeNextOpen — the next opening moment in the restaurant's local words.
 *
 * Pinned by Luigi's 2026-08-16 00:30 call: the model was handed the UTC ISO
 * "2026-08-16T14:00:00Z" and told the caller "we reopen at two o'clock this
 * afternoon" — the store opens at 10 AM Toronto. The label is now a computed
 * fact; these tests make sure it stays local, hoursFormat-aware and natural.
 */
import { describe, expect, it, vi } from "vitest";

// context-payload imports prisma at module top; the helper under test is pure.
vi.mock("@/lib/db", () => ({ default: {} }));
vi.mock("@/lib/shipday", () => ({ shouldDispatchToShipday: async () => false, shipdayPayAtDoorEnabled: async () => false }));

import { describeNextOpen } from "./context-payload";

const TZ = "America/Toronto";

describe("describeNextOpen", () => {
  it("00:30 Sunday Toronto, opens 10:00 the same local date → 'this morning at 10:00 AM' (never the UTC hour)", () => {
    const now = new Date("2026-08-16T04:30:51Z"); // 00:30:51 EDT Sun
    const next = new Date("2026-08-16T14:00:00Z"); // 10:00 EDT Sun
    const words = describeNextOpen(next, now, TZ, "12h");
    expect(words).toBe("this morning at 10:00 AM");
    expect(words).not.toMatch(/\b2:00|14:00|two\b/);
  });

  it("24h format keeps the restaurant's preference", () => {
    const now = new Date("2026-08-16T04:30:51Z");
    const next = new Date("2026-08-16T14:00:00Z");
    expect(describeNextOpen(next, now, TZ, "24h")).toBe("this morning at 10:00");
  });

  it("afternoon / evening parts on the same date", () => {
    const now = new Date("2026-08-16T13:00:00Z"); // 09:00 EDT
    expect(describeNextOpen(new Date("2026-08-16T18:00:00Z"), now, TZ, "12h")).toBe("this afternoon at 2:00 PM");
    expect(describeNextOpen(new Date("2026-08-16T22:30:00Z"), now, TZ, "12h")).toBe("this evening at 6:30 PM");
  });

  it("closed for the rest of today → 'tomorrow (Weekday) at …' on the next local date", () => {
    const now = new Date("2026-08-16T03:30:00Z"); // 23:30 EDT Sat Aug 15
    const next = new Date("2026-08-16T14:00:00Z"); // 10:00 EDT Sun Aug 16
    expect(describeNextOpen(next, now, TZ, "12h")).toBe("tomorrow (Sunday) at 10:00 AM");
  });

  it("further out → the weekday name", () => {
    const now = new Date("2026-08-16T03:30:00Z"); // Sat night
    const next = new Date("2026-08-18T15:00:00Z"); // Tue 11:00 EDT
    expect(describeNextOpen(next, now, TZ, "12h")).toBe("Tuesday at 11:00 AM");
  });

  it("the local calendar decides 'tomorrow', not a 24 h delta: 23:30 Sat → Sun 10:00 is 'tomorrow' even though it is 10.5 h away", () => {
    const now = new Date("2026-08-16T03:30:00Z");
    const next = new Date("2026-08-16T14:00:00Z");
    expect(describeNextOpen(next, now, TZ, "12h")).toMatch(/^tomorrow/);
  });

  it("an unknown timezone still yields a weekday + time rather than throwing", () => {
    const now = new Date("2026-08-16T03:30:00Z");
    const next = new Date("2026-08-16T14:00:00Z");
    expect(() => describeNextOpen(next, now, "Not/AZone", "12h")).not.toThrow();
    expect(describeNextOpen(next, now, "Not/AZone", "12h")).toMatch(/at \d/);
  });
});
