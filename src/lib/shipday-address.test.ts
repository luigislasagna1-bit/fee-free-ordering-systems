import { describe, it, expect } from "vitest";
import {
  buildDeliveryInstruction,
  buildDropoffAddress,
  buildPickupAddress,
  countryName,
  singleLineAddress,
} from "@/lib/shipday-address";

// Locks the fix for the 2026-08-13 Uber Direct regression: every quote came
// back "out of delivery area" on drops 1-3 km from the store, because Uber
// re-geocodes the dropoff STRING (discarding our coordinates, unlike DoorDash)
// and that string had no province and no country. Live payload at the time:
//   "1095 Ezard Cres, Milton, L9T 6W9"   ← Milton, *which* country?

const LUIGI = { state: "Ontario", country: "CA" };

describe("buildDropoffAddress — the customer's geocodable address", () => {
  it("inherits province + country from the store (no Order column holds either)", () => {
    const a = buildDropoffAddress({
      deliveryAddress: "1095 Ezard Cres",
      deliveryCity: "Milton",
      deliveryZip: "L9T 6W9",
      restaurantState: LUIGI.state,
      restaurantCountry: LUIGI.country,
    });
    expect(a).toEqual({
      street: "1095 Ezard Cres",
      city: "Milton",
      state: "Ontario",
      zip: "L9T 6W9",
      country: "Canada",
    });
    expect(singleLineAddress(a)).toBe("1095 Ezard Cres, Milton, Ontario, L9T 6W9, Canada");
  });

  it("prefers the STRUCTURED street, so kitchen-line noise never reaches a geocoder", () => {
    // Order.deliveryAddress bakes in the extras (composeFlatDeliveryAddress);
    // this one went to Uber as "6911 Derry Road West, Apt RBC Branch, …".
    const a = buildDropoffAddress({
      deliveryAddress: "6911 Derry Road West, Apt RBC Branch, Parking: behind the plaza",
      deliveryCity: "Milton",
      deliveryZip: "L9T 7H5",
      deliveryAddressData: { street: "6911 Derry Road West", city: "Milton", postcode: "L9T 7H5", apartment: "RBC Branch", parking: "behind the plaza" },
      restaurantState: LUIGI.state,
      restaurantCountry: LUIGI.country,
    });
    expect(a.street).toBe("6911 Derry Road West");
    expect(a.unit).toBe("RBC Branch");
    expect(singleLineAddress(a)).not.toContain("Parking");
  });

  it("falls back to the flat column when the order predates the structured form", () => {
    const a = buildDropoffAddress({
      deliveryAddress: "933 maple",
      deliveryCity: "milton",
      deliveryZip: "l9t2h6",
      restaurantState: LUIGI.state,
      restaurantCountry: LUIGI.country,
    });
    // …and tidies it on the way out: capitalized, postcode canonicalized.
    expect(singleLineAddress(a)).toBe("933 Maple, Milton, Ontario, L9T 2H6, Canada");
  });

  it("omits what it doesn't have rather than inventing it", () => {
    const a = buildDropoffAddress({
      deliveryAddress: "12 Main St",
      deliveryCity: null,
      deliveryZip: null,
      restaurantState: null,
      restaurantCountry: null,
    });
    expect(a).toEqual({ street: "12 Main St" });
  });
});

describe("buildPickupAddress — the store's address", () => {
  it("adds the country the flat join never had, and canonicalizes the postcode", () => {
    // Luigi's record literally stores "L9T2H6" with no space.
    const a = buildPickupAddress({ address: "17 Commercial St", city: "Milton", state: "Ontario", zip: "L9T2H6", country: "CA" });
    expect(singleLineAddress(a)).toBe("17 Commercial St, Milton, Ontario, L9T 2H6, Canada");
  });
});

describe("countryName", () => {
  it("expands the ISO code to a name — 'CA' must never reach a geocoder as California", () => {
    expect(countryName("CA")).toBe("Canada");
    expect(countryName("US")).toBe("United States");
    expect(countryName("it")).toBe("Italy");
  });
  it("passes an unknown code through, and blank stays undefined", () => {
    expect(countryName("ZZ")).toBe("ZZ");
    expect(countryName(null)).toBeUndefined();
    expect(countryName("  ")).toBeUndefined();
  });
});

describe("buildDeliveryInstruction — where the address extras go instead", () => {
  it("moves floor/intercom/parking next to the customer's note", () => {
    expect(
      buildDeliveryInstruction("ring twice", {
        street: "12 Main St",
        floor: "3",
        intercom: "1234",
        parking: "behind the plaza",
      }),
    ).toBe("Floor: 3 · Intercom: 1234 · Parking: behind the plaza · ring twice");
  });

  it("the unit is NOT duplicated here — it stays in the address", () => {
    expect(buildDeliveryInstruction(null, { street: "12 Main St", apartment: "4B" })).toBeUndefined();
  });

  it("no note and no extras → undefined (never an empty string)", () => {
    expect(buildDeliveryInstruction(null, null)).toBeUndefined();
    expect(buildDeliveryInstruction("  ", { street: "12 Main St" })).toBeUndefined();
  });
});
