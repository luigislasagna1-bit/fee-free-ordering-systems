import { describe, it, expect } from "vitest";
import {
  weekStartUtc, previousWeekStartUtc, weekEndUtc, FEEFREE_DELIVERY_PER_ORDER_CENTS,
  feeCentsForDistanceKm, feeCentsForDelivery, resolveFrozenFeeCents, isFeeFreeServiceArea, FEEFREE_SERVICE_ANCHOR,
} from "./feefree-delivery";

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
  it("the base/first-tier per-delivery fee is $7.99", () => {
    expect(FEEFREE_DELIVERY_PER_ORDER_CENTS).toBe(799);
  });
});

describe("FeeFree distance-tiered fee (7.99 / 8.99 / 9.99)", () => {
  it("bands by distance, inclusive of the upper bound", () => {
    expect(feeCentsForDistanceKm(0)).toBe(799);
    expect(feeCentsForDistanceKm(3.5)).toBe(799);
    expect(feeCentsForDistanceKm(3.6)).toBe(899);
    expect(feeCentsForDistanceKm(7)).toBe(899);
    expect(feeCentsForDistanceKm(7.1)).toBe(999);
    expect(feeCentsForDistanceKm(10)).toBe(999);
    expect(feeCentsForDistanceKm(25)).toBe(999); // beyond top band → top tier
  });
  it("falls back to the base fee on invalid distance", () => {
    expect(feeCentsForDistanceKm(NaN)).toBe(799);
    expect(feeCentsForDistanceKm(-1)).toBe(799);
  });
  it("feeCentsForDelivery uses the base fee when any coordinate is missing", () => {
    expect(feeCentsForDelivery(null, null, 43.5, -79.9)).toBe(799);
    expect(feeCentsForDelivery(43.5, -79.9, null, undefined)).toBe(799);
  });
  it("feeCentsForDelivery tiers by the restaurant→customer distance", () => {
    // ~2km apart → first tier; the anchor + a point ~2km east.
    const near = feeCentsForDelivery(43.5183, -79.8774, 43.5183, -79.8526);
    expect(near).toBe(799);
    // ~8km apart → third tier.
    const far = feeCentsForDelivery(43.5183, -79.8774, 43.5183, -79.7780);
    expect(far).toBe(999);
  });

  describe("resolveFrozenFeeCents — superadmin per-store flat override", () => {
    // ~8km apart (third tier, $9.99) so we can see the override beat the tiers.
    const r = { rLat: 43.5183, rLng: -79.8774, cLat: 43.5183, cLng: -79.7780 };
    it("a valid override wins over the distance tiers", () => {
      expect(resolveFrozenFeeCents(650, r.rLat, r.rLng, r.cLat, r.cLng)).toBe(650); // flat $6.50 beats the $9.99 tier
      expect(resolveFrozenFeeCents(1500, r.rLat, r.rLng, r.cLat, r.cLng)).toBe(1500);
    });
    it("a $0 override is honored (comped store) — not treated as 'unset'", () => {
      expect(resolveFrozenFeeCents(0, r.rLat, r.rLng, r.cLat, r.cLng)).toBe(0);
    });
    it("null / undefined override falls back to the distance tiers", () => {
      expect(resolveFrozenFeeCents(null, r.rLat, r.rLng, r.cLat, r.cLng)).toBe(999);
      expect(resolveFrozenFeeCents(undefined, r.rLat, r.rLng, r.cLat, r.cLng)).toBe(999);
    });
    it("an invalid override (negative / NaN) falls back to the tiers", () => {
      expect(resolveFrozenFeeCents(-100, r.rLat, r.rLng, r.cLat, r.cLng)).toBe(999);
      expect(resolveFrozenFeeCents(NaN, r.rLat, r.rLng, r.cLat, r.cLng)).toBe(999);
    });
    it("no override + missing coords → base fee (the tiers' own fallback)", () => {
      expect(resolveFrozenFeeCents(null, null, null, r.cLat, r.cLng)).toBe(799);
    });
  });
});

describe("FeeFree service area (≤100km of Milton)", () => {
  it("includes the anchor itself + nearby GTA points", () => {
    expect(isFeeFreeServiceArea(FEEFREE_SERVICE_ANCHOR.lat, FEEFREE_SERVICE_ANCHOR.lng)).toBe(true);
    expect(isFeeFreeServiceArea(43.6532, -79.3832)).toBe(true); // downtown Toronto ~40km
  });
  it("excludes far-away + coordinate-less restaurants", () => {
    expect(isFeeFreeServiceArea(45.5019, -73.5674)).toBe(false); // Montreal ~500km
    expect(isFeeFreeServiceArea(null, null)).toBe(false);
  });
});
