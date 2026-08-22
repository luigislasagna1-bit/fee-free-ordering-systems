/**
 * A6 / C13 — isCoarseGeocode: an area-level Google hit must never become a
 * delivery pin (call cmt2iowvh: a country centroid became "Zone 8, $49.99").
 */
import { describe, expect, it } from "vitest";
import { isCoarseGeocode } from "./geocode-precision";

describe("isCoarseGeocode", () => {
  it("street-level results are precise", () => {
    expect(isCoarseGeocode({ types: ["street_address"], locationType: "ROOFTOP" })).toBe(false);
    expect(isCoarseGeocode({ types: ["premise"], locationType: "ROOFTOP" })).toBe(false);
    expect(isCoarseGeocode({ types: ["route"], locationType: "GEOMETRIC_CENTER" })).toBe(false);
    expect(isCoarseGeocode({ types: ["establishment", "point_of_interest"], locationType: "GEOMETRIC_CENTER" })).toBe(false);
    expect(isCoarseGeocode({ types: ["street_address"], locationType: "RANGE_INTERPOLATED" })).toBe(false);
  });
  it("areas are coarse whatever the location_type says", () => {
    expect(isCoarseGeocode({ types: ["country", "political"], locationType: "APPROXIMATE" })).toBe(true);
    expect(isCoarseGeocode({ types: ["locality", "political"], locationType: "APPROXIMATE" })).toBe(true);
    expect(isCoarseGeocode({ types: ["postal_code"], locationType: "APPROXIMATE" })).toBe(true);
    expect(isCoarseGeocode({ types: ["administrative_area_level_1", "political"], locationType: "GEOMETRIC_CENTER" })).toBe(true);
    expect(isCoarseGeocode({ types: ["neighborhood", "political"], locationType: "APPROXIMATE" })).toBe(true);
  });
  it("no types: APPROXIMATE is coarse, anything better is trusted; no result is coarse", () => {
    expect(isCoarseGeocode({ types: [], locationType: "APPROXIMATE" })).toBe(true);
    expect(isCoarseGeocode({ types: [], locationType: "ROOFTOP" })).toBe(false);
    expect(isCoarseGeocode({})).toBe(false);
    expect(isCoarseGeocode(null)).toBe(true);
  });
});
