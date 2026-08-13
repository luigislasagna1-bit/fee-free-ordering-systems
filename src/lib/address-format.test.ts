/**
 * Address display formatting.
 *
 * Luigi 2026-08-12: "addresses should be capitalized and correctly formatted.
 * many orders come in just with lowercase street name. doesn't look good" —
 * plus his GloriaFood reference showing the FULL address (street, postcode,
 * city) where ours printed the street alone.
 *
 * The rules that matter are the ones that say what we DON'T touch: an address
 * the customer typed correctly must come out the other side unchanged.
 */
import { describe, it, expect } from "vitest";
import {
  formatAddressCase,
  formatPostcode,
  formatAddressLine,
  formatFullDeliveryAddress,
} from "./address-format";

describe("formatAddressCase", () => {
  it("capitalizes the lowercase street names Luigi is seeing", () => {
    expect(formatAddressCase("705 rayner court")).toBe("705 Rayner Court");
    expect(formatAddressCase("17 commercial st")).toBe("17 Commercial St");
    expect(formatAddressCase("via giuseppe mazzini 13")).toBe("Via Giuseppe Mazzini 13");
  });

  it("never degrades capitals the customer got right", () => {
    // The whole reason we only lift the FIRST letter.
    expect(formatAddressCase("123 McMaster Ave")).toBe("123 McMaster Ave");
    expect(formatAddressCase("8 O'Brien Road")).toBe("8 O'Brien Road");
    expect(formatAddressCase("42 MacDonald-Cartier Way")).toBe("42 MacDonald-Cartier Way");
    // ALL CAPS is left alone: down-casing it would wreck genuine acronyms.
    expect(formatAddressCase("100 RCMP BLVD")).toBe("100 RCMP BLVD");
  });

  it("capitalizes unit codes but not ordinal street numbers", () => {
    expect(formatAddressCase("apt 12b")).toBe("Apt 12B");
    expect(formatAddressCase("unit 4a")).toBe("Unit 4A");
    // "1ST AVE" was the trap — an ordinal is a street number, not a unit code.
    expect(formatAddressCase("123 1st ave")).toBe("123 1st Ave");
    expect(formatAddressCase("55 22nd street")).toBe("55 22nd Street");
  });

  it("is idempotent, so normalizing on write and formatting on display agree", () => {
    const once = formatAddressCase("705 rayner court");
    expect(formatAddressCase(once)).toBe(once);
  });

  it("survives empty and whitespace-only input", () => {
    expect(formatAddressCase(null)).toBe("");
    expect(formatAddressCase(undefined)).toBe("");
    expect(formatAddressCase("   ")).toBe("");
    expect(formatAddressCase("705   rayner   court")).toBe("705 Rayner Court");
  });
});

describe("formatPostcode", () => {
  it("upper-cases and re-spaces a Canadian postal code", () => {
    expect(formatPostcode("l9t0p1")).toBe("L9T 0P1");
    expect(formatPostcode("L9T 0P1")).toBe("L9T 0P1");
    expect(formatPostcode(" l9t 0p1 ")).toBe("L9T 0P1");
  });

  it("re-spaces a UK postcode", () => {
    expect(formatPostcode("sw1a1aa")).toBe("SW1A 1AA");
    expect(formatPostcode("m11ae")).toBe("M1 1AE");
  });

  it("leaves every other country's format alone beyond upper-casing", () => {
    expect(formatPostcode("90210")).toBe("90210");        // US
    expect(formatPostcode("75008")).toBe("75008");        // FR
    expect(formatPostcode("1234 ab")).toBe("1234 AB");    // NL
    expect(formatPostcode("100-0001")).toBe("100-0001");  // JP
  });

  it("survives empty input", () => {
    expect(formatPostcode(null)).toBe("");
    expect(formatPostcode("  ")).toBe("");
  });
});

describe("formatAddressLine", () => {
  it("formats every comma-separated part of a composed address", () => {
    expect(formatAddressLine("17 commercial st, apt 4b")).toBe("17 Commercial St, Apt 4B");
  });

  it("leaves a customer's free-text instructions as they typed them", () => {
    // Title-casing a sentence reads worse than leaving it alone — only the
    // label gets capitalized.
    expect(formatAddressLine("17 commercial st, parking: behind the plaza, use side door")).toBe(
      "17 Commercial St, Parking: behind the plaza, Use Side Door",
    );
  });

  it("survives empty input and stray commas", () => {
    expect(formatAddressLine(null)).toBe("");
    expect(formatAddressLine("17 commercial st,,")).toBe("17 Commercial St");
  });
});

describe("formatFullDeliveryAddress", () => {
  it("prints street, postcode and city — the parts the emails used to drop", () => {
    expect(
      formatFullDeliveryAddress({ street: "705 rayner court", city: "milton", postcode: "l9t0p1" }),
    ).toBe("705 Rayner Court, L9T 0P1, Milton");
  });

  it("never repeats a city or postcode a legacy flat address already embeds", () => {
    expect(
      formatFullDeliveryAddress({ street: "705 rayner court, milton", city: "Milton", postcode: null }),
    ).toBe("705 Rayner Court, Milton");
    // Typed without the space in the street, stored with it in the column.
    expect(
      formatFullDeliveryAddress({ street: "705 rayner court l9t0p1", city: null, postcode: "L9T 0P1" }),
    ).toBe("705 Rayner Court L9T0P1");
  });

  it("degrades to whatever parts exist", () => {
    expect(formatFullDeliveryAddress({ street: "705 rayner court" })).toBe("705 Rayner Court");
    expect(formatFullDeliveryAddress({ city: "milton", postcode: "l9t0p1" })).toBe("L9T 0P1, Milton");
    expect(formatFullDeliveryAddress({})).toBe("");
  });
});
