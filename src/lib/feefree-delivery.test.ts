import { describe, it, expect } from "vitest";
import {
  deliveryWeekStart, previousDeliveryWeekStart, deliveryWeekEnd, FEEFREE_DELIVERY_PER_ORDER_CENTS,
  feeCentsForDistanceKm, feeCentsForDelivery, resolveFrozenFeeCents, isFeeFreeServiceArea, FEEFREE_SERVICE_ANCHOR,
} from "./feefree-delivery";

describe("FeeFreeDelivery week boundaries (Saturday→Friday, America/Toronto)", () => {
  // July 2026 is EDT (UTC-4). The Sat→Fri week around Mon 2026-07-13 runs
  // Sat 2026-07-11 00:00 Toronto (04:00Z) → Sat 2026-07-18 00:00 Toronto (04:00Z).
  it("deliveryWeekStart snaps any instant back to the week's Saturday 00:00 Toronto", () => {
    expect(deliveryWeekStart(new Date("2026-07-13T14:30:00Z")).toISOString()).toBe("2026-07-11T04:00:00.000Z"); // Mon
    expect(deliveryWeekStart(new Date("2026-07-15T13:00:00Z")).toISOString()).toBe("2026-07-11T04:00:00.000Z"); // Wed
  });
  it("keeps a late-Friday-Toronto delivery in the closing week, not the next one", () => {
    // Fri 2026-07-17 23:00 Toronto = 2026-07-18T03:00Z — still the Sat 07-11 week.
    expect(deliveryWeekStart(new Date("2026-07-18T03:00:00Z")).toISOString()).toBe("2026-07-11T04:00:00.000Z");
    // 90 min later, Sat 00:30 Toronto = 2026-07-18T04:30Z — the NEW week has opened.
    expect(deliveryWeekStart(new Date("2026-07-18T04:30:00Z")).toISOString()).toBe("2026-07-18T04:00:00.000Z");
  });
  it("previousDeliveryWeekStart steps back exactly one Sat→Fri week", () => {
    expect(previousDeliveryWeekStart(new Date("2026-07-15T13:00:00Z")).toISOString()).toBe("2026-07-04T04:00:00.000Z");
  });
  it("deliveryWeekEnd is the next Saturday 00:00 Toronto (exclusive)", () => {
    expect(deliveryWeekEnd(new Date("2026-07-11T04:00:00.000Z")).toISOString()).toBe("2026-07-18T04:00:00.000Z");
  });

  // DST correctness — the whole point of anchoring to the IANA zone, not UTC.
  it("spans the fall-back weekend (EDT→EST): a 169-hour week", () => {
    // Nov 1 2026 clocks fall back. Week = Sat Oct 31 (EDT, 04:00Z) → Sat Nov 7 (EST, 05:00Z).
    const ws = deliveryWeekStart(new Date("2026-11-01T17:00:00Z")); // Sun Nov 1 noon Toronto
    expect(ws.toISOString()).toBe("2026-10-31T04:00:00.000Z");
    const we = deliveryWeekEnd(ws);
    expect(we.toISOString()).toBe("2026-11-07T05:00:00.000Z");
    expect((we.getTime() - ws.getTime()) / 3_600_000).toBe(169); // 24×7 + 1
  });
  it("spans the spring-forward weekend (EST→EDT): a 167-hour week", () => {
    // Mar 14 2027 clocks spring forward. Week = Sat Mar 13 (EST, 05:00Z) → Sat Mar 20 (EDT, 04:00Z).
    const ws = deliveryWeekStart(new Date("2027-03-15T16:00:00Z")); // Mon Mar 15 noon Toronto
    expect(ws.toISOString()).toBe("2027-03-13T05:00:00.000Z");
    const we = deliveryWeekEnd(ws);
    expect(we.toISOString()).toBe("2027-03-20T04:00:00.000Z");
    expect((we.getTime() - ws.getTime()) / 3_600_000).toBe(167); // 24×7 − 1
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
