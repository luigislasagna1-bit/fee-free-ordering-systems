import { describe, it, expect } from "vitest";
import { buildAddressQueries, stripUnitNoise } from "./nominatim";

/**
 * The fallback ladder is the whole point of this module, and it's pure — the
 * network half is exercised by hand against live Nominatim. These lock in the
 * rules that actually bit us (Sofia Chilly meals, Islamabad, 2026-08-10).
 */
describe("buildAddressQueries", () => {
  it("never puts the country in the query text (it goes as a countrycodes filter)", () => {
    const rungs = buildAddressQueries({
      address: "1 Yonge Street",
      city: "Toronto",
      state: "ON",
      zip: "M5E 1E5",
      country: "CA",
    });
    expect(rungs.length).toBeGreaterThan(0);
    for (const r of rungs) {
      expect(r.q).not.toMatch(/\bCA\b/);
      expect(r.q.toLowerCase()).not.toContain("canada");
    }
  });

  it("orders rungs precise-first and drops the postcode before the street", () => {
    const rungs = buildAddressQueries({
      address: "B17, Islamabad, Qurtabad School",
      city: "Islamabad",
      state: "",
      zip: "44000",
      country: "PK",
    });

    expect(rungs).toEqual([
      { q: "B17, Islamabad, Qurtabad School, Islamabad, 44000", precise: true },
      { q: "B17, Islamabad, Qurtabad School, Islamabad", precise: true },
      { q: "Islamabad, 44000", precise: false },
      { q: "Islamabad", precise: false },
    ]);
  });

  it("marks a rung coarse whenever it carries no street line", () => {
    // No address at all → every rung is a centroid-level guess, so preciseOnly
    // callers (automatic geocoding, save-time) correctly resolve to nothing.
    const rungs = buildAddressQueries({ city: "Islamabad", zip: "44000", country: "PK" });
    expect(rungs.every((r) => !r.precise)).toBe(true);
    expect(rungs.filter((r) => r.precise)).toHaveLength(0);
  });

  it("collapses rungs that would send the identical query twice", () => {
    const rungs = buildAddressQueries({ address: "1 Yonge Street", city: "Toronto" });
    expect(rungs).toEqual([
      { q: "1 Yonge Street, Toronto", precise: true },
      { q: "Toronto", precise: false },
    ]);
  });

  it("returns nothing to try when every field is blank", () => {
    expect(buildAddressQueries({ country: "PK" })).toEqual([]);
    expect(buildAddressQueries({ address: "  ", city: "", state: null, zip: undefined })).toEqual([]);
  });

  // ── Apartment / unit noise ────────────────────────────────────────────────
  // Luigi 2026-08-11 (Ben Bilton). Three of Luigi's delivery orders stored NO
  // coordinates and therefore no delivery zone, which made a zone-restricted
  // free-delivery promo refuse a qualifying cart. All three are real, findable
  // Milton streets — they only missed because the unit rode along in the street
  // line and free-form Nominatim search is AND-matching.
  it("retries with the apartment stripped — the addresses that lost real orders", () => {
    const cases: [string, string][] = [
      ["66-745 Farmstead Drive", "745 Farmstead Drive"],              // ORD-369250179, charged $7.99
      ["245 Commercial Street, Apt Unit 203", "245 Commercial Street"], // ORD-349997643
      ["1000 Asleton Boulevard, Apt 100", "1000 Asleton Boulevard"],   // ORD-785215817
    ];
    for (const [typed, bare] of cases) {
      expect(stripUnitNoise(typed)).toBe(bare);
      const rungs = buildAddressQueries({ address: typed, city: "Milton", state: "ON", country: "CA" });
      expect(rungs.some((r) => r.q.startsWith(bare) && r.precise)).toBe(true);
    }
  });

  it("keeps the unstripped query FIRST — a unit that OSM does know still wins", () => {
    const rungs = buildAddressQueries({ address: "66-745 Farmstead Drive", city: "Milton" });
    expect(rungs[0].q).toBe("66-745 Farmstead Drive, Milton");
  });

  it("leaves a plain address completely alone, and costs it no extra lookups", () => {
    expect(stripUnitNoise("598 Holly Avenue")).toBe("598 Holly Avenue");
    // Identical to the pre-2026-08-11 ladder — the stripped rungs dedupe away,
    // so an address with no unit still makes exactly the same calls.
    expect(buildAddressQueries({ address: "598 Holly Avenue", city: "Milton" })).toEqual([
      { q: "598 Holly Avenue, Milton", precise: true },
      { q: "Milton", precise: false },
    ]);
  });

  it("does not eat a lettered house number or a street range", () => {
    // "745-A" has no digit after the dash → not a unit prefix.
    expect(stripUnitNoise("745-A Main Street")).toBe("745-A Main Street");
    // A genuine range still lands on the right street, which is all a zone needs.
    expect(stripUnitNoise("12-14 Main Street")).toBe("14 Main Street");
  });

  it("strips unit words in any of the shapes customers actually type", () => {
    expect(stripUnitNoise("12 King St, Unit 4")).toBe("12 King St");
    expect(stripUnitNoise("12 King St, Suite 900")).toBe("12 King St");
    expect(stripUnitNoise("12 King St, #7")).toBe("12 King St");
    expect(stripUnitNoise("12 King St, Floor 3, Buzzer 22")).toBe("12 King St");
    // Case-insensitive, and never touches the street segment itself.
    expect(stripUnitNoise("12 Apartment Row, APT 9")).toBe("12 Apartment Row");
  });
});
