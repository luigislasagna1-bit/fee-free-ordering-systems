import { describe, it, expect } from "vitest";
import {
  parseComboConfig,
  comboAllowedVariantIds,
  comboUpchargeFor,
  comboVariantKey,
  isComboItem,
  remapComboConfigIds,
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

describe("remapComboConfigIds", () => {
  const maps = {
    itemIds: new Map([["p1", "P1"], ["p2", "P2"]]),
    categoryIds: new Map([["c1", "C1"]]),
    variantIds: new Map([["large", "LARGE"], ["xl", "XL"]]),
  };

  it("returns null for non-combos and unparseable input", () => {
    expect(remapComboConfigIds(null, maps)).toBe(null);
    expect(remapComboConfigIds("", maps)).toBe(null);
    expect(remapComboConfigIds("notjson", maps)).toBe(null);
    expect(remapComboConfigIds('{"foo":1}', maps)).toBe(null);
  });

  it("returns null when no reference matched a map (skip the write)", () => {
    expect(remapComboConfigIds('{"slots":[{"id":"s1","itemIds":["other"],"categoryIds":["otherCat"]}]}', maps)).toBe(null);
  });

  it("remaps slot itemIds/categoryIds, keeping unknown ids verbatim", () => {
    const out = remapComboConfigIds(
      '{"slots":[{"id":"s1","itemIds":["p1","stale"],"categoryIds":["c1"]}],"extrasCharge":true}',
      maps,
    );
    const cfg = JSON.parse(out!);
    expect(cfg.slots[0].itemIds).toEqual(["P1", "stale"]);
    expect(cfg.slots[0].categoryIds).toEqual(["C1"]);
    expect(cfg.extrasCharge).toBe(true); // untouched fields pass through
  });

  it("rekeys upcharges, itemVariants (keys + variant values), and variantUpcharges", () => {
    const raw = JSON.stringify({
      slots: [{
        id: "s1",
        itemIds: ["p1"],
        upcharges: { p1: 2, stale: 3 },
        itemVariants: { p1: ["large", "unknownVariant"] },
        variantUpcharges: { "p1::xl": 5, "stale::xl": 1, nosep: 9 },
      }],
    });
    const cfg = JSON.parse(remapComboConfigIds(raw, maps)!);
    const s = cfg.slots[0];
    expect(s.upcharges).toEqual({ P1: 2, stale: 3 });
    expect(s.itemVariants).toEqual({ P1: ["LARGE", "unknownVariant"] });
    expect(s.variantUpcharges).toEqual({ "P1::XL": 5, "stale::XL": 1, nosep: 9 });
  });

  it("survives parseComboConfig round-trip", () => {
    const raw = JSON.stringify({
      slots: [{ id: "s1", label: "Pizza", min: 1, max: 1, itemIds: ["p1", "p2"], categoryIds: ["c1"], upcharges: { p2: 1.5 } }],
      extrasCharge: false,
    });
    const cfg = parseComboConfig(remapComboConfigIds(raw, maps)!);
    expect(cfg).not.toBe(null);
    expect(cfg!.slots[0].itemIds).toEqual(["P1", "P2"]);
    expect(cfg!.slots[0].categoryIds).toEqual(["C1"]);
    expect(cfg!.slots[0].upcharges).toEqual({ P2: 1.5 });
  });
});

describe("isComboItem", () => {
  it("detects a combo item vs a normal item", () => {
    expect(isComboItem({ comboConfig: '{"slots":[{"id":"s1","itemIds":["p1"]}]}' })).toBe(true);
    expect(isComboItem({ comboConfig: null })).toBe(false);
  });
});
