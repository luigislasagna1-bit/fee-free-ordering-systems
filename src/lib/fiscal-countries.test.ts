import { describe, it, expect } from "vitest";
import { getFiscalConfig, isKnownFiscalCountry } from "@/lib/fiscal-countries";

describe("getFiscalConfig — country-specific tax-id fields", () => {
  it("returns the country's native scheme", () => {
    expect(getFiscalConfig("CA").taxIdType).toBe("ca_gst_hst");
    expect(getFiscalConfig("US").taxIdType).toBe("us_ein");
    expect(getFiscalConfig("IT").taxIdType).toBe("eu_vat");
  });
  it("shows the SDI + PEC fields only for Italy", () => {
    expect(getFiscalConfig("IT").showSdiPec).toBe(true);
    expect(getFiscalConfig("DE").showSdiPec).toBe(false);
  });
  it("is case-insensitive and falls back to a generic Tax ID", () => {
    expect(getFiscalConfig("ca").taxIdType).toBe("ca_gst_hst");
    expect(getFiscalConfig("ZZ").taxIdLabel).toBe("Tax ID");
    expect(getFiscalConfig(null).taxIdLabel).toBe("Tax ID");
  });
  it("isKnownFiscalCountry flags explicit schemes", () => {
    expect(isKnownFiscalCountry("IT")).toBe(true);
    expect(isKnownFiscalCountry("ZZ")).toBe(false);
    expect(isKnownFiscalCountry(null)).toBe(false);
  });
});
