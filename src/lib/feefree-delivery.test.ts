import { describe, it, expect } from "vitest";
import { weekStartUtc, previousWeekStartUtc, weekEndUtc, FEEFREE_DELIVERY_PER_ORDER_CENTS } from "./feefree-delivery";

describe("FeeFreeDelivery week boundaries (Monday-anchored, UTC)", () => {
  it("weekStartUtc snaps to the containing week's Monday 00:00 UTC", () => {
    // 2026-07-13 is a Monday.
    expect(weekStartUtc(new Date("2026-07-13T14:30:00Z")).toISOString()).toBe("2026-07-13T00:00:00.000Z");
    expect(weekStartUtc(new Date("2026-07-15T09:00:00Z")).toISOString()).toBe("2026-07-13T00:00:00.000Z"); // Wed
    expect(weekStartUtc(new Date("2026-07-19T23:59:00Z")).toISOString()).toBe("2026-07-13T00:00:00.000Z"); // Sun
  });
  it("previousWeekStartUtc is exactly 7 days earlier", () => {
    expect(previousWeekStartUtc(new Date("2026-07-15T00:00:00Z")).toISOString()).toBe("2026-07-06T00:00:00.000Z");
  });
  it("weekEndUtc is the next Monday (exclusive end)", () => {
    expect(weekEndUtc(new Date("2026-07-13T00:00:00Z")).toISOString()).toBe("2026-07-20T00:00:00.000Z");
  });
  it("the flat per-delivery fee is $7.99", () => {
    expect(FEEFREE_DELIVERY_PER_ORDER_CENTS).toBe(799);
  });
});
