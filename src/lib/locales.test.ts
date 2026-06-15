import { describe, it, expect } from "vitest";
import { isSupportedLocale, isRtlLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "@/lib/locales";

describe("locales", () => {
  it("recognises supported locale codes and rejects others", () => {
    expect(isSupportedLocale("en")).toBe(true);
    expect(isSupportedLocale("ar")).toBe(true);
    expect(isSupportedLocale("xx")).toBe(false);
    expect(isSupportedLocale(123)).toBe(false);
  });
  it("flags right-to-left locales", () => {
    expect(isRtlLocale("ar")).toBe(true);
    expect(isRtlLocale("he")).toBe(true);
    expect(isRtlLocale("en")).toBe(false);
    expect(isRtlLocale("xx")).toBe(false);
  });
  it("defaults to English over a broad locale set", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(SUPPORTED_LOCALES).toContain("en");
    expect(SUPPORTED_LOCALES.length).toBeGreaterThanOrEqual(37);
  });
});
