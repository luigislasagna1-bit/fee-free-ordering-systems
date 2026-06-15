import { describe, it, expect } from "vitest";
import { getPlatformTax, stripeTaxRateDisplayName } from "@/lib/platform-tax";

describe("getPlatformTax — tax the platform charges restaurants", () => {
  it("is tax-exempt outside Canada", () => {
    const t = getPlatformTax({ country: "US", state: "CA" });
    expect(t.ratePct).toBe(0);
    expect(t.type).toBe("none");
    expect(t.province).toBe(null);
  });
  it("charges the destination province's combined rate inside Canada", () => {
    expect(getPlatformTax({ country: "CA", state: "ON" }).ratePct).toBe(13);
    expect(getPlatformTax({ country: "CA", state: "QC" }).ratePct).toBe(14.975);
    expect(getPlatformTax({ country: "CA", state: "AB" }).ratePct).toBe(5);
  });
  it("accepts Canada + province in various forms (case + aliases)", () => {
    expect(getPlatformTax({ country: "Canada", state: "Ontario" }).province).toBe("ON");
    expect(getPlatformTax({ country: "can", state: "ont" }).ratePct).toBe(13);
  });
  it("under-bills (0% pending) rather than over-bills on a missing province", () => {
    const t = getPlatformTax({ country: "CA", state: "" });
    expect(t.ratePct).toBe(0);
    expect(t.province).toBe(null);
  });
  it("classifies the tax type", () => {
    expect(getPlatformTax({ country: "CA", state: "ON" }).type).toBe("HST");
    expect(getPlatformTax({ country: "CA", state: "QC" }).type).toBe("GST_QST");
    expect(getPlatformTax({ country: "CA", state: "AB" }).type).toBe("GST");
  });
});

describe("stripeTaxRateDisplayName — stable per tax type for Stripe caching", () => {
  it("names the rate the same way every time", () => {
    expect(stripeTaxRateDisplayName(getPlatformTax({ country: "US", state: "" }))).toBe("Tax-exempt");
    expect(stripeTaxRateDisplayName(getPlatformTax({ country: "CA", state: "ON" }))).toBe("HST (13%)");
  });
});
