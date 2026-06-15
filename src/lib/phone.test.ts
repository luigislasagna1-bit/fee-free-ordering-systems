import { describe, it, expect } from "vitest";
import { sanitizePhone } from "@/lib/phone";

describe("sanitizePhone — E.164 normalisation", () => {
  it("trusts an existing + prefix and strips formatting", () => {
    expect(sanitizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });
  it("rejects a + number that's too short or too long", () => {
    expect(sanitizePhone("+1234567")).toBe(null); // 7 digits < 8
    expect(sanitizePhone("+1234567890123456")).toBe(null); // 16 digits > 15
  });
  it("treats an 11-digit 1xxx number as NANP", () => {
    expect(sanitizePhone("1 (647) 669-0808")).toBe("+16476690808");
  });
  it("defaults a 10-digit number to +1 (NANP)", () => {
    expect(sanitizePhone("647-669-0808")).toBe("+16476690808");
  });
  it("returns null for empty, junk, or wrong-length input", () => {
    expect(sanitizePhone("")).toBe(null);
    expect(sanitizePhone(null)).toBe(null);
    expect(sanitizePhone("hello")).toBe(null);
    expect(sanitizePhone("12345")).toBe(null); // 5 digits, no +
  });
});
