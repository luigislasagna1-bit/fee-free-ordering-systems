import { describe, expect, it } from "vitest";
import { groupBundleChildren } from "./bundle-child-groups";

const coke = (over: Record<string, unknown> = {}) => ({
  menuItemId: "coke", name: "Coke", variantId: "can", variantName: "Can", ...over,
});

describe("groupBundleChildren", () => {
  it("collapses identical children into one line with qty (the 4-pop case)", () => {
    const g = groupBundleChildren([coke(), coke(), coke(), coke()]);
    expect(g).toHaveLength(1);
    expect(g[0].qty).toBe(4);
  });

  it("keeps distinct drinks apart, preserving first-appearance order (2+2)", () => {
    const g = groupBundleChildren([coke(), { menuItemId: "pepsi", name: "Pepsi" }, coke(), { menuItemId: "pepsi", name: "Pepsi" }]);
    expect(g.map((x) => [x.child.name, x.qty])).toEqual([["Coke", 2], ["Pepsi", 2]]);
  });

  it("different size, modifiers, note, or fee ⇒ separate lines", () => {
    expect(groupBundleChildren([coke(), coke({ variantId: "bottle", variantName: "Bottle" })])).toHaveLength(2);
    expect(groupBundleChildren([coke(), coke({ modifiers: [{ name: "No ice" }] })])).toHaveLength(2);
    expect(groupBundleChildren([coke(), coke({ notes: "cold please" })])).toHaveLength(2);
    expect(groupBundleChildren([coke(), coke({ extrasFee: 0.5 })])).toHaveLength(2);
  });

  it("identical modifier lists DO collapse", () => {
    const mods = [{ name: "No ice", priceAdjustment: 0 }];
    const g = groupBundleChildren([coke({ modifiers: mods }), coke({ modifiers: [...mods] })]);
    expect(g).toHaveLength(1);
    expect(g[0].qty).toBe(2);
  });

  it("pizzas NEVER collapse, even when identical", () => {
    const p = { menuItemId: "pz", name: "Pizza", pizzaCustomization: { isHalfHalf: false } };
    const g = groupBundleChildren([p, { ...p }]);
    expect(g).toHaveLength(2);
    expect(g.every((x) => x.qty === 1)).toBe(true);
  });

  it("empty input → empty output", () => {
    expect(groupBundleChildren([])).toEqual([]);
  });
});
