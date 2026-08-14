import { describe, it, expect } from "vitest";
import { resolveResellerKitBrand, readableOn, PLATFORM_BRAND_NAME } from "./brand";

const APPROVED = { status: "approved" as const };

describe("resolveResellerKitBrand — the three reseller states", () => {
  it("plain partner (no imprint, no logo) gets platform branding", () => {
    const b = resolveResellerKitBrand({ ...APPROVED, companyName: "Acme Digital" });
    expect(b.tier).toBe("platform");
    expect(b.brandName).toBe(PLATFORM_BRAND_NAME);
    expect(b.allowPlatformMark).toBe(true);
    expect(b.landingBrandMismatch).toBe(false);
  });

  it("FREE de-branded partner (imprint only) gets their own name and NO platform mark", () => {
    const b = resolveResellerKitBrand({
      ...APPROVED, companyName: "Acme Digital", imprint: "Acme Digital | hi@acme.com",
    });
    expect(b.tier).toBe("debranded");
    expect(b.brandName).toBe("Acme Digital");
    expect(b.allowPlatformMark).toBe(false);
  });

  it("FREE de-branded partner (logo only) also de-brands", () => {
    const b = resolveResellerKitBrand({
      ...APPROVED, companyName: "Acme Digital", brandLogoUrl: "https://blob/logo.png",
    });
    expect(b.tier).toBe("debranded");
    expect(b.logoUrl).toBe("https://blob/logo.png");
    expect(b.allowPlatformMark).toBe(false);
  });

  it("PAID branded partner gets their brand colours", () => {
    const b = resolveResellerKitBrand({
      ...APPROVED, whiteLabelStatus: "active", companyName: "Acme Digital",
      brandPrimaryColor: "#7C3AED", brandAccentColor: "#F59E0B",
    });
    expect(b.tier).toBe("branded");
    expect(b.colors.primary).toBe("#7c3aed");
    expect(b.colors.accent).toBe("#f59e0b");
    expect(b.allowPlatformMark).toBe(false);
    expect(b.landingBrandMismatch).toBe(false);
  });

  it("an unapproved partner never de-brands, whatever they configured", () => {
    const b = resolveResellerKitBrand({
      status: "pending", companyName: "Acme", imprint: "Acme", brandLogoUrl: "https://x/l.png",
    });
    expect(b.tier).toBe("platform");
    expect(b.allowPlatformMark).toBe(true);
  });
});

describe("resolveResellerKitBrand — the cases that bite", () => {
  /**
   * The headline case: brand colours are only EXPOSED on the paid page, so a free
   * de-branded partner usually has none. Falling back to platform emerald would
   * silently re-brand their flyer as ours through colour alone.
   */
  it("de-branded with NO brand colours falls back to neutral, NOT platform emerald", () => {
    const b = resolveResellerKitBrand({ ...APPROVED, companyName: "Acme", imprint: "Acme" });
    expect(b.tier).toBe("debranded");
    expect(b.colors.primary).toBe("#111827");
    expect(b.colors.primary).not.toBe("#059669");
  });

  it("de-branded with no company name degrades to platform branding and says why", () => {
    const b = resolveResellerKitBrand({ ...APPROVED, brandLogoUrl: "https://x/logo.png" });
    expect(b.tier).toBe("platform");
    expect(b.brandName).toBe(PLATFORM_BRAND_NAME);
    expect(b.degradedReason).toBe("no-company-name");
  });

  it("flags landingBrandMismatch for FREE de-brand only (the upsell moment)", () => {
    const free = resolveResellerKitBrand({ ...APPROVED, companyName: "Acme", imprint: "Acme" });
    const paid = resolveResellerKitBrand({
      ...APPROVED, whiteLabelStatus: "active", companyName: "Acme", imprint: "Acme",
    });
    expect(free.landingBrandMismatch).toBe(true);
    expect(paid.landingBrandMismatch).toBe(false);
  });

  it("rejects malformed colour values instead of emitting broken CSS", () => {
    const b = resolveResellerKitBrand({
      ...APPROVED, whiteLabelStatus: "active", companyName: "Acme",
      brandPrimaryColor: "red", brandAccentColor: "#ABC",
    });
    expect(b.colors.primary).toBe("#111827");
    expect(b.colors.accent).toBe("#374151");
  });

  it("kit accentOverride wins, and never touches the partner's paid brandPrimaryColor", () => {
    const b = resolveResellerKitBrand(
      { ...APPROVED, whiteLabelStatus: "active", companyName: "Acme", brandPrimaryColor: "#7C3AED", brandAccentColor: "#111111" },
      "#22C55E",
    );
    expect(b.colors.accent).toBe("#22c55e");
    expect(b.colors.primary).toBe("#7c3aed");
  });

  it("null/undefined profile is safe", () => {
    expect(resolveResellerKitBrand(null).tier).toBe("platform");
    expect(resolveResellerKitBrand(undefined).brandName).toBe(PLATFORM_BRAND_NAME);
  });
});

describe("readableOn — headline legibility on a partner-chosen colour", () => {
  it("picks white on dark and near-black on light", () => {
    expect(readableOn("#0f172a")).toBe("#ffffff");
    expect(readableOn("#111827")).toBe("#ffffff");
    expect(readableOn("#fde047")).toBe("#0f172a"); // pale yellow brand
    expect(readableOn("#ffffff")).toBe("#0f172a");
  });

  it("a pale brand colour flows through to onPrimary", () => {
    const b = resolveResellerKitBrand({
      ...APPROVED, whiteLabelStatus: "active", companyName: "Acme", brandPrimaryColor: "#FDE047",
    });
    expect(b.colors.onPrimary).toBe("#0f172a");
  });
});
