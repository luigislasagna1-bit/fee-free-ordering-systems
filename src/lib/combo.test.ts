import { describe, it, expect } from "vitest";
import {
  parseComboConfig,
  comboAllowedVariantIds,
  comboUpchargeFor,
  comboVariantKey,
  isComboItem,
} from "@/lib/combo";

describe("parseComboConfig", () => {
  it("returns null for non-combos", () => {
    expect(parseComboConfig(null)).toBe(null);
    expect(parseComboConfig("")).toBe(null);
    expect(parseComboConfig("notjson")).toBe(null);
    expect(parseComboConfig({ slots: [] })).toBe(null);
  });
  it("parses a valid combo and fills sensible defaults", () => {
    const cfg = parseComboConfig({ slots: [{ id: "s1", label: "Pizza", itemIds: ["p1", "p2"] }] });
    expect(cfg).not.toBe(null);
    expect(cfg!.slots).toHaveLength(1);
    expect(cfg!.slots[0].min).toBe(1);
    expect(cfg!.slots[0].max).toBe(1);
    expect(cfg!.extrasCharge).toBe(false);
  });
  it("drops slots with an empty pool", () => {
    const cfg = parseComboConfig({
      slots: [{ id: "s1", itemIds: [], categoryIds: [] }, { id: "s2", itemIds: ["p1"] }],
    });
    expect(cfg!.slots).toHaveLength(1);
    expect(cfg!.slots[0].id).toBe("s2");
  });
  it("accepts a JSON string and honours extrasCharge", () => {
    const cfg = parseComboConfig('{"slots":[{"id":"s1","itemIds":["p1"]}],"extrasCharge":true}');
    expect(cfg!.extrasCharge).toBe(true);
  });
  it("round-trips allowDuplicates: only an explicit false survives", () => {
    const off = parseComboConfig({ slots: [{ id: "s1", itemIds: ["p1"], allowDuplicates: false }] });
    expect(off!.slots[0].allowDuplicates).toBe(false);
    const on = parseComboConfig({ slots: [{ id: "s1", itemIds: ["p1"], allowDuplicates: true }] });
    expect(on!.slots[0].allowDuplicates).toBeUndefined(); // absent = allowed (default)
    const absent = parseComboConfig({ slots: [{ id: "s1", itemIds: ["p1"] }] });
    expect(absent!.slots[0].allowDuplicates).toBeUndefined();
  });
  it("round-trips sharedToppings and drops junk values", () => {
    expect(parseComboConfig({ slots: [{ id: "s1", itemIds: ["p1"] }], sharedToppings: 6 })!.sharedToppings).toBe(6);
    expect(parseComboConfig({ slots: [{ id: "s1", itemIds: ["p1"] }], sharedToppings: 6.9 })!.sharedToppings).toBe(6);
    for (const junk of [0, -2, "abc", null, undefined, NaN]) {
      expect(parseComboConfig({ slots: [{ id: "s1", itemIds: ["p1"] }], sharedToppings: junk })!.sharedToppings).toBeUndefined();
    }
    // …and survives a stringify → parse cycle (the admin save → customer load path).
    const saved = JSON.stringify({ slots: [{ id: "s1", itemIds: ["p1"], allowDuplicates: false }], extrasCharge: false, sharedToppings: 4 });
    const back = parseComboConfig(saved)!;
    expect(back.sharedToppings).toBe(4);
    expect(back.slots[0].allowDuplicates).toBe(false);
  });
});

describe("combo upcharge + variant resolution", () => {
  const slot = {
    id: "s1", label: "", min: 1, max: 1, itemIds: ["p1"], categoryIds: [],
    upcharges: { p1: 2 },
    itemVariants: { p1: ["large"] },
    variantUpcharges: { "p1::xl": 5 },
  };
  it("prefers a per-variant upcharge, then per-item, else 0", () => {
    expect(comboUpchargeFor(slot, "p1", "xl")).toBe(5);
    expect(comboUpchargeFor(slot, "p1", "small")).toBe(2);
    expect(comboUpchargeFor(slot, "p1")).toBe(2);
    expect(comboUpchargeFor(slot, "p2")).toBe(0);
  });
  it("returns allowed variant ids, or null when unrestricted", () => {
    expect(comboAllowedVariantIds(slot, "p1")).toEqual(["large"]);
    expect(comboAllowedVariantIds(slot, "p2")).toBe(null);
  });
  it("builds a stable variant key", () => {
    expect(comboVariantKey("p1", "xl")).toBe("p1::xl");
  });
});

describe("isComboItem", () => {
  it("detects a combo item vs a normal item", () => {
    expect(isComboItem({ comboConfig: '{"slots":[{"id":"s1","itemIds":["p1"]}]}' })).toBe(true);
    expect(isComboItem({ comboConfig: null })).toBe(false);
  });
});
