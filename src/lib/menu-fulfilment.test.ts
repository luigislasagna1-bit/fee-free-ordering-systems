import { describe, it, expect } from "vitest";
import {
  buildFulfilData,
  hasFulfilWindow,
  isFulfilableAt,
  fulfilWindowLabel,
  combinedFulfilConstraint,
  earliestFulfilSlot,
} from "@/lib/menu-fulfilment";

// Guards the per-item "Fulfilment Time" logic behind the reseller-reported cart
// warnings (R4) and the cart fulfilment-conflict prompt. Day-of-week is JS
// convention: 0 = Sunday … 6 = Saturday. Tests derive the weekday from the date
// itself (getUTCDay) so they don't hard-code which calendar day is which.

// buildFulfilData returns a discriminated union; this unwraps the happy path.
function fulfil(input: Parameters<typeof buildFulfilData>[0]) {
  const r = buildFulfilData(input);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

describe("buildFulfilData — admin input normalisation", () => {
  it("collapses all-7 (or none) days to null = any day", () => {
    expect(fulfil({ days: [0, 1, 2, 3, 4, 5, 6] }).fulfilDays).toBe(null);
    expect(fulfil({ days: [] }).fulfilDays).toBe(null);
  });
  it("stores a partial day set as sorted, de-duped JSON", () => {
    expect(fulfil({ days: [4, 2, 2] }).fulfilDays).toBe("[2,4]");
  });
  it("requires BOTH ends of a time window — drops a half-set one", () => {
    expect(fulfil({ from: "12:00", to: null }).fulfilFrom).toBe(null);
    const w = fulfil({ from: "12:00", to: "15:00" });
    expect([w.fulfilFrom, w.fulfilTo]).toEqual(["12:00", "15:00"]);
  });
  it("rejects an invalid time string", () => {
    expect(fulfil({ from: "25:99", to: "15:00" }).fulfilFrom).toBe(null);
  });
  it("null input clears everything", () => {
    expect(fulfil(null)).toEqual({ fulfilDays: null, fulfilFrom: null, fulfilTo: null, fulfilWindows: null });
  });
});

describe("hasFulfilWindow", () => {
  it("is false with no restriction, true with a day or a full time window", () => {
    expect(hasFulfilWindow({})).toBe(false);
    expect(hasFulfilWindow({ fulfilDays: "[2]" })).toBe(true);
    expect(hasFulfilWindow({ fulfilFrom: "12:00", fulfilTo: "15:00" })).toBe(true);
    expect(hasFulfilWindow({ fulfilFrom: "12:00" })).toBe(false);
  });
});

describe("isFulfilableAt", () => {
  const when = new Date("2026-06-16T13:00:00Z"); // 13:00 UTC
  const dow = when.getUTCDay();

  it("an unrestricted item is always orderable", () => {
    expect(isFulfilableAt({}, when, "UTC")).toBe(true);
  });
  it("honours the day rule", () => {
    expect(isFulfilableAt({ fulfilDays: JSON.stringify([dow]) }, when, "UTC")).toBe(true);
    expect(isFulfilableAt({ fulfilDays: JSON.stringify([(dow + 1) % 7]) }, when, "UTC")).toBe(false);
  });
  it("honours the time window", () => {
    expect(isFulfilableAt({ fulfilFrom: "12:00", fulfilTo: "15:00" }, when, "UTC")).toBe(true);
    expect(isFulfilableAt({ fulfilFrom: "14:00", fulfilTo: "15:00" }, when, "UTC")).toBe(false);
  });
  it("handles an overnight window that crosses midnight", () => {
    const late = new Date("2026-06-16T23:30:00Z");
    const early = new Date("2026-06-16T01:00:00Z");
    const noon = new Date("2026-06-16T12:00:00Z");
    expect(isFulfilableAt({ fulfilFrom: "22:00", fulfilTo: "02:00" }, late, "UTC")).toBe(true);
    expect(isFulfilableAt({ fulfilFrom: "22:00", fulfilTo: "02:00" }, early, "UTC")).toBe(true);
    expect(isFulfilableAt({ fulfilFrom: "22:00", fulfilTo: "02:00" }, noon, "UTC")).toBe(false);
  });
  it("requires BOTH the right day and the right time when both are set", () => {
    const both = { fulfilDays: JSON.stringify([dow]), fulfilFrom: "12:00", fulfilTo: "15:00" };
    expect(isFulfilableAt(both, when, "UTC")).toBe(true);
    expect(isFulfilableAt({ ...both, fulfilFrom: "14:00" }, when, "UTC")).toBe(false);
    expect(
      isFulfilableAt({ ...both, fulfilDays: JSON.stringify([(dow + 1) % 7]) }, when, "UTC"),
    ).toBe(false);
  });
});

describe("fulfilWindowLabel", () => {
  const dayName = (d: number) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d];
  const fmt = (t: string) => t;
  it("renders days, a time window, both, or nothing", () => {
    expect(fulfilWindowLabel({ fulfilDays: "[2,3]", fulfilFrom: "12:00", fulfilTo: "15:00" }, dayName, fmt))
      .toBe("Tue, Wed · 12:00 – 15:00");
    expect(fulfilWindowLabel({ fulfilDays: "[2,3]" }, dayName, fmt)).toBe("Tue, Wed");
    expect(fulfilWindowLabel({ fulfilFrom: "12:00", fulfilTo: "15:00" }, dayName, fmt)).toBe("12:00 – 15:00");
    expect(fulfilWindowLabel({}, dayName, fmt)).toBe("");
  });
});

describe("combinedFulfilConstraint — the cart conflict detector (R4)", () => {
  it("intersects the allowed days across items", () => {
    expect(combinedFulfilConstraint([{ fulfilDays: "[2,3,4]" }, { fulfilDays: "[3,4,5]" }]).days)
      .toEqual([3, 4]);
  });
  it("flags an impossible combination (disjoint days) with an empty array", () => {
    expect(combinedFulfilConstraint([{ fulfilDays: "[2]" }, { fulfilDays: "[4]" }]).days).toEqual([]);
  });
  it("takes the tightest common time window — latest start, earliest end", () => {
    const r = combinedFulfilConstraint([
      { fulfilFrom: "10:00", fulfilTo: "16:00" },
      { fulfilFrom: "12:00", fulfilTo: "14:00" },
    ]);
    expect([r.from, r.to]).toEqual(["12:00", "14:00"]);
  });
  it("returns no constraint when nothing in the cart is restricted", () => {
    expect(combinedFulfilConstraint([{}, {}])).toEqual({ days: null, from: null, to: null });
  });
});

describe("earliestFulfilSlot", () => {
  const now = new Date("2026-06-16T13:00:00Z");
  it("returns null when the item is unrestricted or already orderable", () => {
    expect(earliestFulfilSlot({}, now, "UTC")).toBe(null);
    expect(earliestFulfilSlot({ fulfilDays: JSON.stringify([now.getUTCDay()]) }, now, "UTC")).toBe(null);
  });
  it("returns the next valid slot when not orderable now", () => {
    const target = (now.getUTCDay() + 2) % 7;
    const slot = earliestFulfilSlot({ fulfilDays: JSON.stringify([target]) }, now, "UTC");
    expect(slot).not.toBe(null);
    expect(slot!.getUTCDay()).toBe(target);
    expect(slot!.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("multi-window fulfilment (Fabrizio cmr803ovq c)", () => {
  // Fabrizio's exact example: Mon–Thu 10:00–15:00 PLUS Fri–Sun 15:00–20:00.
  const item = {
    fulfilWindows: [
      { days: [1, 2, 3, 4], from: "10:00", to: "15:00" },
      { days: [5, 6, 0], from: "15:00", to: "20:00" },
    ],
  };
  it("orderable inside the weekday window", () => {
    expect(isFulfilableAt(item, new Date("2026-06-16T12:00:00Z"), "UTC")).toBe(true); // Tue 12:00
  });
  it("NOT orderable on a weekday outside its hours", () => {
    expect(isFulfilableAt(item, new Date("2026-06-16T16:00:00Z"), "UTC")).toBe(false); // Tue 16:00
  });
  it("orderable inside the weekend window (which would fail the weekday one)", () => {
    expect(isFulfilableAt(item, new Date("2026-06-20T16:00:00Z"), "UTC")).toBe(true); // Sat 16:00
  });
  it("NOT orderable on the weekend outside its hours", () => {
    expect(isFulfilableAt(item, new Date("2026-06-20T12:00:00Z"), "UTC")).toBe(false); // Sat 12:00
  });
  it("hasFulfilWindow sees the list; the legacy triple still works as one window", () => {
    expect(hasFulfilWindow(item)).toBe(true);
    expect(hasFulfilWindow({ fulfilDays: "[2]" })).toBe(true);
    expect(hasFulfilWindow({})).toBe(false);
  });
  it("stringified JSON column value parses the same as an array", () => {
    expect(isFulfilableAt({ fulfilWindows: JSON.stringify(item.fulfilWindows) }, new Date("2026-06-20T16:00:00Z"), "UTC")).toBe(true);
  });
  it("label lists every window", () => {
    const label = fulfilWindowLabel(item, (d) => "DAY" + d, (t) => t);
    expect(label).toContain(" / ");
    expect(label).toContain("10:00 – 15:00");
    expect(label).toContain("15:00 – 20:00");
  });
  it("buildFulfilData: 2+ windows persist the list and mirror window 1 into the legacy triple", () => {
    const r = buildFulfilData({ windows: [
      { days: [1, 2, 3, 4], from: "10:00", to: "15:00" },
      { days: [5, 6, 0], from: "15:00", to: "20:00" },
    ] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fulfilWindows).toHaveLength(2);
      expect(r.data.fulfilDays).toBe("[1,2,3,4]");
      expect([r.data.fulfilFrom, r.data.fulfilTo]).toEqual(["10:00", "15:00"]);
    }
  });
  it("buildFulfilData: a single window stays legacy-only (fulfilWindows null)", () => {
    const r = buildFulfilData({ windows: [{ days: [2], from: "10:00", to: "15:00" }] });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.fulfilWindows).toBe(null);
      expect(r.data.fulfilDays).toBe("[2]");
    }
  });
  it("combinedFulfilConstraint: multi-window item contributes the UNION of its days", () => {
    // The two windows together cover all 7 days → day-unrestricted; and a
    // multi-timed-window item can't be represented by one [from,to] band, so
    // time tightening is skipped (the server's per-item check still guards).
    const r = combinedFulfilConstraint([item as any]);
    expect(r.days).toBe(null);
    expect([r.from, r.to]).toEqual([null, null]);
    // Partial coverage still restricts: Mon/Tue lunch window + all-day Saturday.
    const partial = combinedFulfilConstraint([
      { fulfilWindows: [{ days: [1, 2], from: "10:00", to: "15:00" }, { days: [6], from: null, to: null }] } as any,
    ]);
    expect(partial.days).toEqual([1, 2, 6]);
  });
});
