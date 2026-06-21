import { describe, it, expect } from "vitest";
import { groupMaxSelect, mapGroup, type GFGroup } from "./gloriafood";

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
