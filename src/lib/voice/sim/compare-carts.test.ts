/**
 * compareCarts — the grader. Edge cases the suite depends on: swap-invariant
 * halves, itemAlt families, doubles, combos with slot labels, merged identical
 * lines, order independence, missing / extra lines, size only when expected.
 */
import { describe, expect, it } from "vitest";
import { compareCarts, compareHalves } from "./compare-carts";
import type { CanonicalCart, CanonicalLine } from "./scenario-types";

const pizza = (item: string, qty: number, whole: string[], left: string[] = [], right: string[] = [], extra: Partial<CanonicalLine> = {}): CanonicalLine => ({
  item,
  qty,
  options: [],
  halves: { left, right, whole },
  ...extra,
});
const simple = (item: string, qty: number, options: string[] = [], size?: string): CanonicalLine => ({ item, qty, options, ...(size ? { size } : {}) });
const cart = (...lines: CanonicalLine[]): CanonicalCart => ({ lines });

describe("compareCarts — exactness", () => {
  it("identical carts are exact regardless of line/option/topping order and merge identical lines", () => {
    const expected = cart(pizza("P", 2, ["pepperoni", "bacon"]), simple("W", 1, ["hot mixed"], "20"));
    const actual = cart(simple("W", 1, ["Hot Mixed"], "20"), pizza("P", 1, ["bacon", "pepperoni"]), pizza("P", 1, ["Pepperoni", "Bacon"]));
    const d = compareCarts(actual, expected);
    expect(d.exact).toBe(true);
    expect(d.matched).toBe(2);
    expect(d.missing).toEqual([]);
    expect(d.extra).toEqual([]);
    expect(d.items).toEqual({ correct: 2, total: 2 });
    expect(d.qty).toEqual({ correct: 2, total: 2 });
    expect(d.humanSummary).toEqual(["exact match"]);
  });

  it("halves are swap-invariant (left/right may be mirrored), whole is not", () => {
    const expected = cart(pizza("P", 1, ["bacon"], ["pepperoni", "mushrooms"], ["green peppers", "onions"]));
    const mirrored = cart(pizza("P", 1, ["bacon"], ["green peppers", "onions"], ["pepperoni", "mushrooms"]));
    expect(compareCarts(mirrored, expected).exact).toBe(true);
    const wholeMoved = cart(pizza("P", 1, [], ["pepperoni", "mushrooms", "bacon"], ["green peppers", "onions"]));
    const d = compareCarts(wholeMoved, expected);
    expect(d.exact).toBe(false);
    expect(d.halves).toEqual({ correct: 0, total: 1 });
    expect(d.humanSummary).toEqual(expect.arrayContaining([expect.stringMatching(/missing topping 'bacon' on whole/), expect.stringMatching(/unexpected topping 'bacon' on left/)]));
  });

  it("compareHalves picks the orientation with more agreement", () => {
    const r = compareHalves({ left: ["a", "b"], right: ["c"], whole: [] }, { left: ["c"], right: ["a", "b"], whole: [] });
    expect(r.exact).toBe(true);
    expect(r.swapped).toBe(true);
    const partial = compareHalves({ left: ["a"], right: ["c", "d"], whole: [] }, { left: ["c"], right: ["a", "b"], whole: [] });
    expect(partial.exact).toBe(false);
    expect(partial.sides.find((s) => s.side === "right")?.missing).toEqual(["b"]);
    expect(partial.sides.find((s) => s.side === "left")?.extra).toEqual(["d"]);
  });

  it("doubles must match as '2x name'", () => {
    const expected = cart(pizza("P", 1, ["2x pepperoni", "mushrooms"]));
    expect(compareCarts(cart(pizza("P", 1, ["2x pepperoni", "mushrooms"])), expected).exact).toBe(true);
    const single = compareCarts(cart(pizza("P", 1, ["pepperoni", "mushrooms"])), expected);
    expect(single.exact).toBe(false);
    expect(single.humanSummary).toEqual(expect.arrayContaining([expect.stringMatching(/missing topping '2x pepperoni' on whole/), expect.stringMatching(/unexpected topping 'pepperoni' on whole/)]));
  });

  it("itemAlt: an actual line on a sibling product counts as the same item", () => {
    const expected = cart({ ...pizza("L1", 1, ["pepperoni"]), itemAlt: ["L2", "L3"] });
    const d = compareCarts(cart(pizza("L3", 1, ["pepperoni"])), expected);
    expect(d.exact).toBe(true);
    expect(d.items).toEqual({ correct: 1, total: 1 });
    const wrong = compareCarts(cart(pizza("M1", 1, ["pepperoni"])), expected);
    expect(wrong.exact).toBe(false);
    expect(wrong.missing).toHaveLength(1);
    expect(wrong.extra).toHaveLength(1);
    expect(wrong.items).toEqual({ correct: 0, total: 1 });
  });
});

describe("compareCarts — field diffs", () => {
  it("qty mismatch, missing and extra lines are reported per line and reduce accuracy counters", () => {
    const expected = cart(simple("W", 1, ["hot mixed"], "20"), simple("D", 2, ["garlic"]), simple("C", 1, ["coke"]));
    const actual = cart(simple("W", 1, ["hot mixed"], "20"), simple("D", 1, ["garlic"]), simple("X", 1, []));
    const d = compareCarts(actual, expected);
    expect(d.exact).toBe(false);
    expect(d.matched).toBe(2);
    expect(d.items).toEqual({ correct: 2, total: 3 });
    expect(d.qty).toEqual({ correct: 1, total: 3 });
    expect(d.missing.map((l) => l.item)).toEqual(["C"]);
    expect(d.extra.map((l) => l.item)).toEqual(["X"]);
    expect(d.humanSummary).toEqual(
      expect.arrayContaining([expect.stringMatching(/line 2 \(D\): qty 1, expected 2/), expect.stringMatching(/line 1 \(C\): MISSING/), expect.stringMatching(/^extra: 1× X/)]),
    );
  });

  it("size is compared only when the expected line names one", () => {
    expect(compareCarts(cart(simple("W", 1, ["hot mixed"], "20")), cart(simple("W", 1, ["hot mixed"]))).exact).toBe(true);
    const d = compareCarts(cart(simple("W", 1, ["hot mixed"], "10")), cart(simple("W", 1, ["hot mixed"], "20")));
    expect(d.exact).toBe(false);
    expect(d.sizes).toEqual({ correct: 0, total: 1 });
    expect(d.humanSummary[0]).toMatch(/size '10', expected '20'/);
  });

  it("options: missing and unexpected are both named; excluded toppings count as 'no x'", () => {
    const d = compareCarts(cart(simple("W", 1, ["mild mixed"], "20")), cart(simple("W", 1, ["hot mixed"], "20")));
    expect(d.exact).toBe(false);
    expect(d.modifiers).toEqual({ correct: 0, total: 2 });
    expect(d.humanSummary).toEqual(expect.arrayContaining([expect.stringMatching(/missing option 'hot mixed'/), expect.stringMatching(/unexpected option 'mild mixed'/)]));
    const ex = compareCarts(cart(pizza("H", 1, ["pineapple"], [], [], { excluded: ["ham"] })), cart(pizza("H", 1, ["pineapple"])));
    expect(ex.exact).toBe(false);
    expect(ex.humanSummary[0]).toMatch(/unexpected option 'no ham'/);
  });

  it("note: expected note must be contained in the actual note", () => {
    expect(compareCarts(cart(pizza("P", 1, ["pepperoni"], [], [], { note: "Well done please" })), cart(pizza("P", 1, ["pepperoni"], [], [], { note: "well done" }))).exact).toBe(true);
    const d = compareCarts(cart(pizza("P", 1, ["pepperoni"])), cart(pizza("P", 1, ["pepperoni"], [], [], { note: "well done" })));
    expect(d.exact).toBe(false);
    expect(d.humanSummary[0]).toMatch(/note '' does not contain 'well done'/);
  });
});

describe("compareCarts — combos", () => {
  const combo = (picks: CanonicalLine["picks"]): CanonicalLine => ({ item: "COMBO", qty: 1, options: [], picks });

  it("picks pair by item ∪ itemAlt and are graded on slot / size / options / halves", () => {
    const expected = cart(
      combo([
        { slot: "pizza", item: "L3", itemAlt: ["L1"], options: [], halves: { left: ["pepperoni"], right: ["mushrooms"], whole: [] } },
        { slot: "chicken wings", item: "W", options: ["hot mixed"] },
      ]),
    );
    const good = cart(
      combo([
        { slot: "chicken wings", item: "W", size: "20", options: ["hot mixed"] },
        { slot: "pizza", item: "L1", options: [], halves: { left: ["mushrooms"], right: ["pepperoni"], whole: [] } },
      ]),
    );
    const d = compareCarts(good, expected);
    expect(d.exact).toBe(true);
    expect(d.comboSlots).toEqual({ correct: 2, total: 2 });

    const bad = cart(
      combo([
        { slot: "chicken wings", item: "W", options: ["mild mixed"] },
        { slot: "pizza", item: "L1", options: [], halves: { left: ["pepperoni", "bacon"], right: ["mushrooms"], whole: [] } },
      ]),
    );
    const b = compareCarts(bad, expected);
    expect(b.exact).toBe(false);
    expect(b.comboSlots).toEqual({ correct: 0, total: 2 });
    expect(b.humanSummary).toEqual(
      expect.arrayContaining([expect.stringMatching(/pick W \[chicken wings\]: missing option 'hot mixed'/), expect.stringMatching(/pick L3 \[pizza\]: unexpected topping 'bacon' on left/)]),
    );
  });

  it("missing / unexpected picks fail the line and are named", () => {
    const expected = cart(combo([{ slot: "choose 4 pop", item: "POP", options: ["coke"] }, { slot: "choose 4 pop", item: "POP", options: ["coke"] }]));
    const d = compareCarts(cart(combo([{ slot: "choose 4 pop", item: "POP", options: ["coke"] }, { slot: "choose 4 pop", item: "POP", options: ["pepsi"] }])), expected);
    expect(d.exact).toBe(false);
    expect(d.comboSlots).toEqual({ correct: 1, total: 2 });
    expect(d.humanSummary.some((s) => /unexpected option 'pepsi'/.test(s) || /missing pick/.test(s))).toBe(true);
    const short = compareCarts(cart(combo([{ slot: "choose 4 pop", item: "POP", options: ["coke"] }])), expected);
    expect(short.humanSummary).toEqual(expect.arrayContaining([expect.stringMatching(/missing pick POP \[choose 4 pop\] \(coke\)/)]));
  });

  it("an expected pick with slot '' accepts any slot", () => {
    const expected = cart(combo([{ slot: "", item: "W", options: ["hot mixed"] }]));
    expect(compareCarts(cart(combo([{ slot: "chicken wings", item: "W", options: ["hot mixed"] }])), expected).exact).toBe(true);
  });
});
