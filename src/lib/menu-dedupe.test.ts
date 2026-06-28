import { describe, it, expect } from "vitest";
import { planCategoryMerges, normalizeName, type CatLike } from "@/lib/menu-dedupe";

const cat = (id: string, name: string, items: [string, string][], over: Partial<CatLike> = {}): CatLike => ({
  id, name, menuId: "m1", sortOrder: 0, createdAt: new Date("2026-01-01"),
  menuItems: items.map(([iid, iname]) => ({ id: iid, name: iname })), ...over,
});

describe("menu-dedupe — normalizeName", () => {
  it("lowercases, trims, collapses whitespace", () => {
    expect(normalizeName("  Pizza   Specials ")).toBe("pizza specials");
    expect(normalizeName("PIZZA")).toBe("pizza");
  });
});

describe("menu-dedupe — planCategoryMerges", () => {
  it("no duplicates → no plans", () => {
    expect(planCategoryMerges([cat("a", "Pizza", []), cat("b", "Pasta", [])])).toEqual([]);
  });

  it("merges same-name categories (case/space-insensitive); survivor keeps the most items", () => {
    const plans = planCategoryMerges([
      cat("a", "Pizza", [["i1", "Margherita"]]),
      cat("b", " pizza ", [["i2", "Pepperoni"], ["i3", "Hawaiian"]]),
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].survivorId).toBe("b");          // b has 2 items → survivor
    expect(plans[0].loserIds).toEqual(["a"]);
    expect(plans[0].moveItemIds).toEqual(["i1"]);    // Margherita moves in
    expect(plans[0].deleteItemIds).toEqual([]);
  });

  it("removes exact-duplicate items (same normalized name already in survivor)", () => {
    const plans = planCategoryMerges([
      cat("a", "Pizza", [["i1", "Margherita"], ["i2", "Pepperoni"]]),
      cat("b", "Pizza", [["i3", "margherita"], ["i4", "Veggie"]]),
    ]);
    // survivor tie on item-count (2 each) → lowest sortOrder/earliest → "a"
    expect(plans[0].survivorId).toBe("a");
    expect(plans[0].deleteItemIds).toContain("i3"); // duplicate Margherita removed
    expect(plans[0].moveItemIds).toContain("i4");   // Veggie moved in
    expect(plans[0].moveItemIds).not.toContain("i3");
  });

  it("does NOT merge across different menus", () => {
    const plans = planCategoryMerges([
      cat("a", "Pizza", [], { menuId: "m1" }),
      cat("b", "Pizza", [], { menuId: "m2" }),
    ]);
    expect(plans).toEqual([]);
  });

  it("handles 3+ duplicates folding all losers into one survivor", () => {
    const plans = planCategoryMerges([
      cat("a", "Drinks", [["i1", "Coke"], ["i2", "Sprite"]]),
      cat("b", "drinks", [["i3", "Water"]]),
      cat("c", "DRINKS", [["i4", "coke"]]), // dup of Coke
    ]);
    expect(plans).toHaveLength(1);
    expect(plans[0].survivorId).toBe("a");
    expect(plans[0].loserIds.sort()).toEqual(["b", "c"]);
    expect(plans[0].moveItemIds).toContain("i3");   // Water moves
    expect(plans[0].deleteItemIds).toContain("i4"); // duplicate Coke removed
  });

  it("tie-breaks survivor by sortOrder when item counts equal", () => {
    const plans = planCategoryMerges([
      cat("a", "Sides", [["i1", "Fries"]], { sortOrder: 5 }),
      cat("b", "Sides", [["i2", "Salad"]], { sortOrder: 2 }),
    ]);
    expect(plans[0].survivorId).toBe("b"); // lower sortOrder wins
  });
});
