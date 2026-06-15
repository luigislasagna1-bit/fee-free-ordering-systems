import { describe, it, expect } from "vitest";
import { validatePassword } from "@/lib/password";

describe("validatePassword — complexity rules", () => {
  it("accepts a strong password", () => {
    expect(validatePassword("Lasagna2026!")).toBe(null);
  });
  it("requires at least 10 characters", () => {
    expect(validatePassword("Ab1!")).toMatch(/10 characters/);
  });
  it("requires an uppercase letter", () => {
    expect(validatePassword("lasagna2026!")).toMatch(/uppercase/);
  });
  it("requires a number", () => {
    expect(validatePassword("Lasagnaaaa!")).toMatch(/number/);
  });
  it("requires a special character", () => {
    expect(validatePassword("Lasagna2026")).toMatch(/special/);
  });
});
