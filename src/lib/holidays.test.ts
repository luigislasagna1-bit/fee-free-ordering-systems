import { describe, it, expect } from "vitest";
import { isPublicHoliday, SUPPORTED_HOLIDAY_COUNTRIES } from "@/lib/holidays";

describe("isPublicHoliday", () => {
  it("recognises known US federal holidays", () => {
    expect(isPublicHoliday(new Date(2026, 6, 4), "US")).toBe(true); // Jul 4 2026
    expect(isPublicHoliday(new Date(2026, 11, 25), "US")).toBe(true); // Dec 25 2026
  });
  it("recognises a Canadian holiday", () => {
    expect(isPublicHoliday(new Date(2026, 6, 1), "CA")).toBe(true); // Canada Day
  });
  it("is false on an ordinary day and for unsupported countries", () => {
    expect(isPublicHoliday(new Date(2026, 6, 5), "US")).toBe(false);
    expect(isPublicHoliday(new Date(2026, 0, 1), "FR")).toBe(false);
  });
  it("lists US + CA as supported", () => {
    expect(SUPPORTED_HOLIDAY_COUNTRIES).toContain("US");
    expect(SUPPORTED_HOLIDAY_COUNTRIES).toContain("CA");
  });
});
