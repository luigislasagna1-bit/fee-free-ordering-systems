import { describe, expect, it } from "vitest";
import { isAddressNotLocated } from "./checkout-address-gate";

const zone = { zone: { name: "Zone A" }, inside: true };

describe("isAddressNotLocated (delivery classification gate)", () => {
  it("blocks a zoned delivery with no coords and no text geocode", () => {
    expect(
      isAddressNotLocated({ orderType: "delivery", hasZones: true, lat: null, lng: null, resolvedZone: null }),
    ).toBe(true);
  });

  it("passes when exact coords exist (picked suggestion / pin / saved address)", () => {
    expect(
      isAddressNotLocated({ orderType: "delivery", hasZones: true, lat: 43.5, lng: -79.9, resolvedZone: null }),
    ).toBe(false);
  });

  // The 2026-08-01 regression case: saved default address without coords whose
  // TEXT geocoded fine — zone line rendered while Place Order stayed dead.
  it("passes when the text geocode resolved a zone even without exact coords", () => {
    expect(
      isAddressNotLocated({ orderType: "delivery", hasZones: true, lat: null, lng: null, resolvedZone: zone }),
    ).toBe(false);
  });

  it("passes on an OUT-of-zone resolution too (classified ≠ deliverable; out-of-area has its own handling)", () => {
    expect(
      isAddressNotLocated({
        orderType: "delivery", hasZones: true, lat: null, lng: null,
        resolvedZone: { zone: { name: "Outside" }, inside: false },
      }),
    ).toBe(false);
  });

  it("still blocks while only half a coordinate pair exists", () => {
    expect(
      isAddressNotLocated({ orderType: "delivery", hasZones: true, lat: 43.5, lng: null, resolvedZone: null }),
    ).toBe(true);
  });

  it("never gates stores without zones", () => {
    expect(
      isAddressNotLocated({ orderType: "delivery", hasZones: false, lat: null, lng: null, resolvedZone: null }),
    ).toBe(false);
  });

  it("never gates pickup / dine-in / take-out", () => {
    for (const orderType of ["pickup", "dine_in", "take_out"]) {
      expect(
        isAddressNotLocated({ orderType, hasZones: true, lat: null, lng: null, resolvedZone: null }),
      ).toBe(false);
    }
  });
});
