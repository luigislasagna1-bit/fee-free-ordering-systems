import { describe, it, expect } from "vitest";
import { formatCurrency } from "@/lib/utils";

// Regression guard for the hardcoded-"$" bug: customer-facing money must render
// in the RESTAURANT's currency, not always dollars. We assert symbol presence
// (robust across Node/ICU versions) plus one exact en-US format.

describe("formatCurrency — currency-aware money formatting", () => {
  it("uses the restaurant's currency symbol, not a hardcoded dollar sign", () => {
    expect(formatCurrency(1234.56, "USD")).toContain("$");
    expect(formatCurrency(1234.56, "GBP")).toContain("£");
    expect(formatCurrency(1234.56, "EUR")).toContain("€");
  });

  it("defaults to USD when no currency is supplied (legacy call sites)", () => {
    expect(formatCurrency(10)).toContain("$");
  });

  it("is case-insensitive on the currency code", () => {
    expect(formatCurrency(10, "gbp")).toContain("£");
  });

  it("never throws on a malformed or unknown currency", () => {
    expect(() => formatCurrency(10, "ZZZ")).not.toThrow(); // valid format, unknown — renders the code
    expect(() => formatCurrency(10, "Z")).not.toThrow(); // malformed — caught internally
    expect(() => formatCurrency(10, "")).not.toThrow(); // empty — defaults to USD
  });

  it("falls back to US dollars when the currency code is malformed", () => {
    expect(formatCurrency(10, "Z")).toContain("$");
  });

  it("formats US dollars with thousands separators and two decimals", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
  });
});
