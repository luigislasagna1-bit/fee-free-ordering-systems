import { describe, it, expect } from "vitest";
import { groupMaxSelect, mapGroup, bitmaskToDaysJson, type GFGroup } from "./gloriafood";

// Minimal GloriaFood option group with 3 options (e.g. a pizza topping group).
function group(force_max: number): GFGroup {
  return {
    id: "g1",
    name: "Toppings",
    required: false,
    force_min: 0,
    force_max,
    allow_quantity: false,
    sort: 0,
    options: [
      { id: "A", name: "Mushroom", price: 0 },
      { id: "B", name: "Pepperoni", price: 0 },
      { id: "C", name: "Olives", price: 0 },
    ],
  } as unknown as GFGroup;
}

describe("gloriafood import — force_max", () => {
  it("force_max=0 means UNLIMITED → maxSelect caps at the option count, not 1 (the pizza-toppings bug)", () => {
    expect(groupMaxSelect(group(0))).toBe(3);
    expect(mapGroup(group(0)).maxSelect).toBe(3);
  });

  it("a positive force_max is the real maximum", () => {
    expect(groupMaxSelect(group(2))).toBe(2);
    expect(mapGroup(group(2)).maxSelect).toBe(2);
  });

  it("force_max=1 stays single-select", () => {
    expect(mapGroup(group(1)).maxSelect).toBe(1);
  });
});

/**
 * Locks in the GloriaFood `active_days` → FFOS `availableDays` bit-order, which
 * was a flagged "unverified" regression risk. Calibrated against Luigi's REAL
 * menu (2026-06-21): GloriaFood is Sunday-first (bit0=Sun…bit6=Sat), matching
 * FFOS's Sunday-first availableDays, so the mapping is 1:1. If anyone "fixes" the
 * bit order on a hunch, these break first.
 */
describe("gloriafood import — active_days bit-order (Sunday-first)", () => {
  it("maps each single day from the real named day-specials", () => {
    expect(bitmaskToDaysJson(1)).toBe("[0]");   // Sunday
    expect(bitmaskToDaysJson(2)).toBe("[1]");   // "Monday Pizza Special"
    expect(bitmaskToDaysJson(4)).toBe("[2]");   // "Tuesday Large Pizza"
    expect(bitmaskToDaysJson(8)).toBe("[3]");   // "WING WEDNESDAYS"
    expect(bitmaskToDaysJson(16)).toBe("[4]");  // "THURSDAY SPECIAL"
    expect(bitmaskToDaysJson(32)).toBe("[5]");  // "FRIDAY SPECIAL"
    expect(bitmaskToDaysJson(64)).toBe("[6]");  // Saturday
  });

  it("maps multi-day combinations in ascending order", () => {
    expect(bitmaskToDaysJson(2 | 32)).toBe("[1,5]");                    // Mon + Fri
    expect(bitmaskToDaysJson(2 | 4 | 8 | 16 | 32)).toBe("[1,2,3,4,5]"); // Mon–Fri
    expect(bitmaskToDaysJson(1 | 64)).toBe("[0,6]");                    // weekend
  });

  it("returns null for all-days (127) and unset (0) — both mean 'every day'", () => {
    expect(bitmaskToDaysJson(127)).toBeNull();
    expect(bitmaskToDaysJson(0)).toBeNull();
  });
});
