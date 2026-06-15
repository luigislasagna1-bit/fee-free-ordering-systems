import { describe, it, expect, vi } from "vitest";

// commission.ts imports the Prisma client at module load for its DB functions.
// We only test the PURE tier calculator, so stub the db import out.
vi.mock("@/lib/db", () => ({ default: {} }));

import { rateForActiveCount } from "@/lib/commission";

describe("rateForActiveCount — reseller commission tiers", () => {
  it("is 0% for 0–4 active-paying restaurants", () => {
    expect(rateForActiveCount(0)).toBe(0);
    expect(rateForActiveCount(4)).toBe(0);
  });
  it("steps to 5% at 5, 10% at 26, 15% at 51 (inclusive lower bounds)", () => {
    expect(rateForActiveCount(5)).toBe(5);
    expect(rateForActiveCount(25)).toBe(5);
    expect(rateForActiveCount(26)).toBe(10);
    expect(rateForActiveCount(50)).toBe(10);
    expect(rateForActiveCount(51)).toBe(15);
    expect(rateForActiveCount(1000)).toBe(15);
  });
});
