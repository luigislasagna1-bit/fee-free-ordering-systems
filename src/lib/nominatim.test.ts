import { describe, it, expect } from "vitest";
import { buildAddressQueries } from "./nominatim";

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
});
