/**
 * Zero-decimal minor-unit conversion (stabilization L8): the charge
 * (payment-intent route) and refund route MUST convert amounts identically —
 * they now share toStripeMinorUnits, and these tests pin its behaviour so an
 * edit can't silently mis-charge or mis-refund by 100×.
 */
import { describe, it, expect, vi } from "vitest";

// @/lib/stripe transitively imports the Prisma singleton at module load —
// the conversion helpers under test never touch it.
vi.mock("@/lib/db", () => ({ default: {} }));

import {
  toStripeMinorUnits,
  fromStripeMinorUnits,
  STRIPE_ZERO_DECIMAL_CURRENCIES,
  STRIPE_THREE_DECIMAL_CURRENCIES,
} from "@/lib/stripe";
import { SUPPORTED_CURRENCIES } from "@/lib/utils";

describe("toStripeMinorUnits / fromStripeMinorUnits", () => {
  it("two-decimal currencies convert ×100 both ways", () => {
    expect(toStripeMinorUnits(12.34, "cad")).toBe(1234);
    expect(toStripeMinorUnits(12.34, "CAD")).toBe(1234);
    expect(toStripeMinorUnits(0.5, "usd")).toBe(50);
    expect(fromStripeMinorUnits(1234, "cad")).toBe(12.34);
    // float dust must round, not truncate (19.99 * 100 = 1998.9999…)
    expect(toStripeMinorUnits(19.99, "eur")).toBe(1999);
  });

  it("zero-decimal currencies pass through whole units", () => {
    expect(toStripeMinorUnits(1000, "jpy")).toBe(1000);
    expect(toStripeMinorUnits(1000.4, "JPY")).toBe(1000);
    expect(fromStripeMinorUnits(1000, "jpy")).toBe(1000);
    expect(toStripeMinorUnits(5000, "krw")).toBe(5000);
  });

  it("ISK is NOT zero-decimal (Stripe treats it as two-decimal — the old per-route sets had this wrong)", () => {
    expect(STRIPE_ZERO_DECIMAL_CURRENCIES.has("isk")).toBe(false);
    expect(toStripeMinorUnits(100, "isk")).toBe(10000);
  });

  it("three-decimal currencies convert ×1000, not ×100 (a 10× undercharge)", () => {
    // 5.500 KWD is 5500 fils. The generic ×100 path would have sent 550 = 0.550 KWD.
    expect(toStripeMinorUnits(5.5, "kwd")).toBe(5500);
    expect(toStripeMinorUnits(5.5, "KWD")).toBe(5500);
    expect(fromStripeMinorUnits(5500, "kwd")).toBe(5.5);
    expect(toStripeMinorUnits(12.34, "bhd")).toBe(12340);
    expect(fromStripeMinorUnits(12340, "omr")).toBe(12.34);
  });

  it("three-decimal amounts are always a multiple of 10 (Stripe rejects otherwise)", () => {
    for (const c of STRIPE_THREE_DECIMAL_CURRENCIES) {
      for (const amount of [5.555, 0.001, 19.999, 7.123, 100]) {
        expect(toStripeMinorUnits(amount, c) % 10).toBe(0);
      }
    }
  });

  it("zero- and three-decimal sets are disjoint", () => {
    for (const c of STRIPE_THREE_DECIMAL_CURRENCIES) {
      expect(STRIPE_ZERO_DECIMAL_CURRENCIES.has(c)).toBe(false);
    }
  });

  it("round-trips exactly for every platform-supported currency", () => {
    for (const { code } of SUPPORTED_CURRENCIES) {
      const c = code.toLowerCase();
      const amount = STRIPE_ZERO_DECIMAL_CURRENCIES.has(c) ? 1234 : 12.34;
      expect(fromStripeMinorUnits(toStripeMinorUnits(amount, c), c)).toBe(amount);
    }
  });

  it("zero-decimal set matches Stripe's published list", () => {
    expect([...STRIPE_ZERO_DECIMAL_CURRENCIES].sort()).toEqual([
      "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
      "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
    ]);
  });
});
