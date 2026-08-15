/**
 * The authoritative cart engine (`services/nabil-voice/src/cart-engine.ts`),
 * driven with a scripted stub compiler so every assertion is about ENGINE
 * semantics — stable lineIds, needs_info lines, the duplicate-add guard,
 * target resolution, half/half edits on the intent, combo pick edits,
 * validation and quote/place bookkeeping. Compiler behaviour itself is pinned
 * in order-line-compiler.test.ts; the two meet in the sim harness.
 */
import { describe, expect, it } from "vitest";
import {
  CartEngine,
  type CompileRequest,
  type CompileResponse,
  type Compiler,
  type PizzaIntent,
  type ComboIntent,
} from "../../../services/nabil-voice/src/cart-engine";
import { buildMenuIndex } from "../../../services/nabil-voice/src/menu-index";

const MENU = {
  restaurant: { id: "r1", name: "Test Pizzeria", currency: "cad" },
  menu: [
    {
      category: "Pizzas",
      items: [
        { menuItemId: "pz_large", name: "Large 3 Topping", price: 23.24, isPizza: true, isCombo: false, hasVariants: false, variants: [] },
        { menuItemId: "pz_xl", name: "EXTRA Large 3 Topping", price: 27.99, isPizza: true, isCombo: false, hasVariants: false, variants: [] },
        { menuItemId: "pz_haw", name: "Hawaiian Pizza", price: 20, isPizza: true, isCombo: false, hasVariants: true, sizeNames: ["Small", "Large"] },
      ],
    },
    {
      category: "Combos",
      items: [{ menuItemId: "cb_double", name: "Double Large Combo", price: 39.99, isPizza: false, isCombo: true, hasVariants: false }],
    },
    {
      category: "Drinks & Sides",
      items: [
        { menuItemId: "dr_coke", name: "Coke", price: 1.99, isPizza: false, isCombo: false, hasVariants: false, variants: [] },
        { menuItemId: "wings", name: "Wings", price: 12, isPizza: false, isCombo: false, hasVariants: true, variants: [{ variantId: "v10", name: "10 pc", price: 12 }, { variantId: "v20", name: "20 pc", price: 22 }] },
        { menuItemId: "dip_garlic", name: "Garlic Dip", price: 0.99, isPizza: false, isCombo: false, hasVariants: false, variants: [], isSoldOut: false },
        { menuItemId: "soldout", name: "Lasagna", price: 15, isPizza: false, isCombo: false, hasVariants: false, variants: [], isSoldOut: true },
      ],
    },
  ],
  notToday: [{ name: "Thursday Smash Burger", available: "Thursdays" }],
};

/** A compiler that behaves like the real one on the axes the engine cares
 *  about: needs a size for Wings, needs a drink for the combo, echoes toppings
 *  into halves, resolves "mushrooms" → "Mushroom", knows Hawaiian has presets. */
function stubCompiler(log: CompileRequest[] = []): Compiler {
  const cap = (s: string) => s.replace(/s$/, "").replace(/^\w/, (c) => c.toUpperCase());
  return {
    async compile(req): Promise<CompileResponse> {
      log.push(req);
      const it: any = req.intent;
      const name = MENU.menu.flatMap((c) => c.items).find((i) => i.menuItemId === it.menuItemId)?.name ?? "?";
      if (req.kind === "item") {
        if (it.menuItemId === "wings" && !it.size) {
          return { ok: true, line: null, readBack: `${it.quantity}× Wings`, pricingNote: null, unresolved: ["Which size for Wings? 10 pc, 20 pc."] };
        }
        const opts = (it.options ?? []) as string[];
        return {
          ok: true,
          line: { menuItemId: it.menuItemId, variantId: it.size ? `v${String(it.size).replace(/\D/g, "")}` : null, quantity: it.quantity, modifiers: opts.map((o) => ({ modifierOptionId: `o_${o}`, name: cap(o) })) },
          readBack: `${it.quantity}× ${it.size ? it.size + " " : ""}${name}${opts.length ? " with " + opts.map(cap).join(", ") : ""}`,
          pricingNote: null,
          unresolved: [],
          lineSubtotal: 10 * it.quantity,
        };
      }
      const compilePizza = (p: any, pname: string) => {
        const toppings = (p.toppings ?? []) as Array<{ name: string; placement: string; count?: number }>;
        if (p.menuItemId === "pz_haw" && !p.size) return { unresolved: ["Which size for Hawaiian Pizza? Small, Large."] };
        const half = toppings.some((t) => t.placement !== "whole");
        const pre = (pl: string) => (pl === "left" ? "(L.H) " : pl === "right" ? "(R.H) " : half ? "(W) " : "");
        const mods = toppings.flatMap((t) => Array.from({ length: t.count ?? 1 }, () => ({ modifierOptionId: `t_${t.name.toLowerCase()}`, name: `${pre(t.placement)}${cap(t.name)}` })));
        const excluded = (p.excludeToppings ?? []) as string[];
        if (p.menuItemId === "pz_haw") {
          for (const preset of ["Ham", "Pineapple"]) if (!excluded.some((e) => cap(e) === preset)) mods.push({ modifierOptionId: `t_${preset.toLowerCase()}`, name: `${half ? "(W) " : ""}${preset}` });
        }
        const halves = half
          ? { left: mods.filter((m) => m.name.startsWith("(L.H)")).map((m) => m.name.slice(6)), right: mods.filter((m) => m.name.startsWith("(R.H)")).map((m) => m.name.slice(6)), whole: mods.filter((m) => m.name.startsWith("(W)")).map((m) => m.name.slice(4)) }
          : null;
        return {
          line: { menuItemId: p.menuItemId, variantId: p.size ? `sz_${p.size}` : null, quantity: p.quantity ?? 1, modifiers: mods, notes: excluded.length ? excluded.map((e) => `NO ${cap(e)}`).join("; ") : null },
          readBack: `${p.quantity ?? 1}× ${pname}${mods.length ? " — " + mods.map((m) => m.name).join(", ") : ""}${excluded.length ? ", no " + excluded.map(cap).join(", no ") : ""}`,
          halves,
          toppings: toppings.map((t) => ({ spoken: t.name, resolved: cap(t.name), placement: t.placement, count: t.count ?? 1 })),
          unresolved: [] as string[],
        };
      };
      if (req.kind === "pizza") {
        const r = compilePizza(it, name);
        if (r.unresolved.length) return { ok: true, line: null, readBack: `${it.quantity}× ${name}`, pricingNote: null, unresolved: r.unresolved };
        return { ok: true, line: r.line as any, readBack: r.readBack, pricingNote: null, unresolved: [], halves: r.halves as any, toppings: r.toppings as any, lineSubtotal: 23 };
      }
      // combo: needs 2 pizzas + 1 drink
      const picks = (it.picks ?? []) as any[];
      const pizzas = picks.filter((p) => p.menuItemId.startsWith("pz_"));
      const drinks = picks.filter((p) => p.menuItemId === "dr_coke");
      const unresolved: string[] = [];
      if (pizzas.length < 2) unresolved.push(`Still need ${2 - pizzas.length} more for Pizza: Large 3 Topping.`);
      if (drinks.length < 1) unresolved.push("Still need 1 more for Drink: Coke.");
      const children: any[] = [];
      const pickSlots: any[] = [];
      let pi = 0;
      picks.forEach((p, index) => {
        if (p.menuItemId.startsWith("pz_")) {
          const r = compilePizza(p, "Large 3 Topping");
          children.push({ menuItemId: p.menuItemId, variantId: null, name: "Large 3 Topping", modifiers: (r.line as any)?.modifiers ?? [] });
          pickSlots.push({ index, slotId: `s_p${++pi}`, slotLabel: `Pizza ${pi}` });
        } else {
          children.push({ menuItemId: p.menuItemId, variantId: null, name: "Coke", modifiers: [] });
          pickSlots.push({ index, slotId: "s_d", slotLabel: "Drink" });
        }
      });
      if (unresolved.length) return { ok: true, line: null, readBack: `${it.quantity}× ${name}`, pricingNote: null, unresolved, pickSlots };
      return {
        ok: true,
        line: { menuItemId: it.menuItemId, variantId: null, quantity: it.quantity, modifiers: [], isCombo: true, bundleItems: children },
        readBack: `${it.quantity}× ${name}: ${children.map((c) => c.name + (c.modifiers.length ? " (" + c.modifiers.map((m: any) => m.name).join(", ") + ")" : "")).join(", ")}`,
        pricingNote: null,
        unresolved: [],
        pickSlots,
        lineSubtotal: 39.99,
      };
    },
  };
}

function engine(opts: Partial<ConstructorParameters<typeof CartEngine>[0]> = {}) {
  const log: CompileRequest[] = [];
  const e = new CartEngine({ compiler: stubCompiler(log), menu: buildMenuIndex(MENU), askGroupIds: [], allowPizzaCombo: true, callerId: "6476690808", ...opts });
  e.beginTurn();
  return { e, log };
}

describe("lineIds are stable and never reused", () => {
  it("numbers monotonically across remove and placement", async () => {
    const { e } = engine();
    const a = await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    const b = await e.addLine({ menuItemId: "dip_garlic", quantity: 2, confirmAnother: true });
    expect(a.ok && a.lineId).toBe("L1");
    expect(b.ok && b.lineId).toBe("L2");
    expect(e.removeLine({ lineId: "L1" }).ok).toBe(true);
    const c = await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    expect(c.ok && c.lineId).toBe("L3");
    e.setFulfilment({ type: "pickup" });
    e.setCustomer({ name: "Marco" });
    e.recordQuote({ total: 12 });
    e.recordPlaced({ orderId: "o1", orderNumber: "ORD-1", total: 12 });
    expect(e.lines()).toHaveLength(0);
    const d = await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    expect(d.ok && d.lineId).toBe("L4");
    expect(e.placedOrders()).toHaveLength(1);
  });
});

describe("incomplete adds create a needs_info line (the 08-15 duplicate-combo fix)", () => {
  it("wings without a size is a line with a question; update_line finishes it — no second line", async () => {
    const { e } = engine();
    const r = await e.addLine({ menuItemId: "wings", quantity: 1 });
    expect(r.ok).toBe(true);
    const line = e.getLine("L1")!;
    expect(line.status).toBe("needs_info");
    expect(line.questions[0]).toMatch(/Which size/);
    expect(e.validate().some((p) => p.code === "line_incomplete" && p.lineId === "L1")).toBe(true);
    const u = await e.updateLine({ lineId: "L1" }, { size: "20 pc" });
    expect(u.ok).toBe(true);
    expect(e.getLine("L1")!.status).toBe("complete");
    expect(e.lines()).toHaveLength(1);
  });

  it("re-adding the same combo while it is unfinished is refused as possible_duplicate; confirmAnother adds", async () => {
    const { e } = engine();
    const r = await e.addLine({ menuItemId: "cb_double", quantity: 1, picks: [{ menuItemId: "pz_large", toppings: [{ name: "pepperoni", placement: "left" }, { name: "bacon", placement: "right" }] }] });
    expect(r.ok).toBe(true);
    expect(e.getLine("L1")!.status).toBe("needs_info");
    const dup = await e.addLine({ menuItemId: "cb_double", quantity: 1, picks: [{ menuItemId: "pz_large" }] });
    expect(dup.ok).toBe(false);
    expect(!dup.ok && dup.code).toBe("possible_duplicate");
    expect(!dup.ok && dup.needsInfo).toBe(true);
    expect(e.lines()).toHaveLength(1);
    // Complete it through the drink slot + a second pizza.
    const u = await e.updateLine({ lineId: "L1" }, { picks: [{ slotLabel: "Pizza", menuItemId: "pz_large", toppings: [{ name: "chicken", placement: "left" }] }, { slotLabel: "Drink", menuItemId: "dr_coke" }] });
    expect(u.ok).toBe(true);
    const line = e.getLine("L1")!;
    expect(line.status).toBe("complete");
    expect((line.intent as ComboIntent).picks.map((p) => p.pickId)).toEqual(["P1", "P2", "P3"]);
    expect(line.pickSlots.map((p) => p.slotLabel)).toEqual(["Pizza 1", "Pizza 2", "Drink"]);
    const another = await e.addLine({ menuItemId: "cb_double", quantity: 1, confirmAnother: true, picks: [{ menuItemId: "pz_large" }, { menuItemId: "pz_large" }, { menuItemId: "dr_coke" }] });
    expect(another.ok && another.lineId).toBe("L2");
  });

  it("an identical complete add within 2 turns is questioned; a later one is not", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    const dup = await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    expect(!dup.ok && dup.code).toBe("possible_duplicate");
    e.beginTurn(); e.beginTurn(); e.beginTurn();
    const later = await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    expect(later.ok).toBe(true);
  });
});

describe("half-and-half edits act on the intent and recompile", () => {
  async function halfHalf() {
    const { e, log } = engine();
    const r = await e.addLine({ menuItemId: "pz_large", quantity: 1, toppings: [{ name: "pepperoni", placement: "left" }, { name: "mushrooms", placement: "left" }, { name: "green peppers", placement: "right" }, { name: "onions", placement: "right" }] });
    expect(r.ok).toBe(true);
    return { e, log };
  }
  it("canonicalises spoken names to the compiler's, and halves come from the compiled line", async () => {
    const { e } = await halfHalf();
    const l = e.getLine("L1")!;
    expect((l.intent as PizzaIntent).toppings.map((t) => t.name)).toEqual(["Pepperoni", "Mushroom", "Green pepper", "Onion"]);
    expect(l.halves).toEqual({ left: ["Pepperoni", "Mushroom"], right: ["Green pepper", "Onion"], whole: [] });
  });
  it("remove without placement takes it off everywhere; with placement only that side", async () => {
    const { e } = await halfHalf();
    await e.updateLine({ lineId: "L1" }, { addToppings: [{ name: "onion", placement: "left" }] });
    expect(e.getLine("L1")!.halves).toEqual({ left: ["Pepperoni", "Mushroom", "Onion"], right: ["Green pepper", "Onion"], whole: [] });
    await e.updateLine({ lineId: "L1" }, { removeToppings: [{ name: "onions", placement: "right" }] });
    expect(e.getLine("L1")!.halves!.right).toEqual(["Green pepper"]);
    expect(e.getLine("L1")!.halves!.left).toContain("Onion");
    await e.updateLine({ lineId: "L1" }, { removeToppings: [{ name: "onion" }] });
    expect(e.getLine("L1")!.halves!.left).not.toContain("Onion");
  });
  it("moveTopping relocates; addToppings whole adds bacon everywhere", async () => {
    const { e } = await halfHalf();
    await e.updateLine({ lineId: "L1" }, { moveTopping: { name: "mushroom", to: "right" } });
    expect(e.getLine("L1")!.halves).toEqual({ left: ["Pepperoni"], right: ["Green pepper", "Onion", "Mushroom"], whole: [] });
    await e.updateLine({ lineId: "L1" }, { addToppings: [{ name: "bacon", placement: "whole" }] });
    expect(e.getLine("L1")!.halves!.whole).toEqual(["Bacon"]);
  });
  it("sameAsLineId clones with changes and gets its own lineId; the original is untouched", async () => {
    const { e } = await halfHalf();
    const c = await e.addLine({ sameAsLineId: "L1", removeToppings: [{ name: "mushrooms" }] });
    expect(c.ok && c.lineId).toBe("L2");
    expect(e.getLine("L2")!.halves!.left).toEqual(["Pepperoni"]);
    expect(e.getLine("L1")!.halves!.left).toEqual(["Pepperoni", "Mushroom"]);
  });
  it("removing a PRESET turns into an exclusion; removing it from one half is refused deterministically", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "pz_haw", quantity: 1, size: "Large" });
    expect(e.getLine("L1")!.compiled!.modifiers.map((m) => m.name)).toEqual(["Ham", "Pineapple"]);
    const u = await e.updateLine({ lineId: "L1" }, { removeToppings: [{ name: "ham" }] });
    expect(u.ok).toBe(true);
    expect((e.getLine("L1")!.intent as PizzaIntent).excludeToppings).toEqual(["Ham"]);
    expect(e.getLine("L1")!.compiled!.modifiers.map((m) => m.name)).toEqual(["Pineapple"]);
    expect(e.getLine("L1")!.compiled!.notes).toBe("NO Ham");
    const bad = await e.updateLine({ lineId: "L1" }, { removeToppings: [{ name: "pineapple", placement: "left" }] });
    expect(!bad.ok && bad.code).toBe("preset_half_remove_unsupported");
    expect((e.getLine("L1")!.intent as PizzaIntent).excludeToppings).toEqual(["Ham"]); // unchanged
  });
  it("an update whose recompile is unresolved leaves a complete line byte-identical", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "pz_haw", quantity: 1, size: "Large" });
    const before = JSON.stringify(e.getLine("L1"));
    const u = await e.updateLine({ lineId: "L1" }, { size: null });
    expect(!u.ok && u.needsInfo).toBe(true);
    expect(!u.ok && u.questions?.[0]).toMatch(/Which size/);
    expect(JSON.stringify(e.getLine("L1"))).toBe(before);
  });
});

describe("resolveTarget never guesses", () => {
  async function two() {
    const { e } = engine();
    await e.addLine({ menuItemId: "pz_large", quantity: 1, toppings: [{ name: "pepperoni", placement: "whole" }] });
    await e.addLine({ menuItemId: "pz_large", quantity: 1, confirmAnother: true, toppings: [{ name: "mushrooms", placement: "whole" }, { name: "olives", placement: "whole" }] });
    await e.addLine({ menuItemId: "dr_coke", quantity: 2 });
    return e;
  }
  it("by lineId, by bare number, by unique topping, by ordinal, by kind+ordinal, by deixis → focus", async () => {
    const e = await two();
    expect((e.resolveTarget({ lineId: "l2" }) as any).line.lineId).toBe("L2");
    expect((e.resolveTarget({ lineId: "2" }) as any).line.lineId).toBe("L2");
    expect((e.resolveTarget({ hint: "the pepperoni one" }) as any).line.lineId).toBe("L1");
    expect((e.resolveTarget({ hint: "the second pizza" }) as any).line.lineId).toBe("L2");
    expect((e.resolveTarget({ hint: "the first one" }) as any).line.lineId).toBe("L1");
    expect((e.resolveTarget({ hint: "the coke" }) as any).line.lineId).toBe("L3");
    // "that one" right after three lines arrived in ONE breath is a question, not a pick.
    expect((e.resolveTarget({ hint: "that one" }) as any).error).toBe("ambiguous_line");
    expect((e.resolveTarget({ hint: "the last pizza" }) as any).line.lineId).toBe("L2");
    // …but once a line arrives on its own turn, "that one" is that line.
    e.beginTurn();
    await e.addLine({ menuItemId: "dip_garlic", quantity: 1 });
    expect((e.resolveTarget({ hint: "that one" }) as any).line.lineId).toBe("L4");
    // A model-chosen lineId that disagrees with the caller's words is not trusted.
    const cross = e.resolveTarget({ lineId: "L1", hint: "the coke" }) as any;
    expect(cross.error).toBe("ambiguous_line");
    // …and a change-scoped hint resolves when only one line can take it (T15).
    const t15 = e.resolveTarget({ hint: "that one" }, (l) => l.aliases.includes("olive")) as any;
    expect(t15.line.lineId).toBe("L2");
  });
  it("revertLastChange restores the intent before the last update", async () => {
    const e = await two();
    await e.updateLine({ lineId: "L1" }, { addToppings: [{ name: "bacon", placement: "whole" }] });
    expect(e.getLine("L1")!.compiled!.modifiers.map((m) => m.name)).toEqual(["Pepperoni", "Bacon"]);
    const r = await e.updateLine({ lineId: "L1" }, { revertLastChange: true });
    expect(r.ok).toBe(true);
    expect(e.getLine("L1")!.compiled!.modifiers.map((m) => m.name)).toEqual(["Pepperoni"]);
    const again = await e.updateLine({ lineId: "L1" }, { revertLastChange: true });
    expect(!again.ok && again.code).toBe("nothing_to_revert");
  });
  it("ambiguous → candidates; unknown → no_such_line", async () => {
    const e = await two();
    const amb = e.resolveTarget({ hint: "the pizza" }) as any;
    expect(amb.error).toBe("ambiguous_line");
    expect(amb.candidates.map((c: any) => c.lineId)).toEqual(["L1", "L2"]);
    expect((e.resolveTarget({ hint: "the lasagna" }) as any).error).toBe("no_such_line");
    expect((e.resolveTarget({ lineId: "L9" }) as any).error).toBe("no_such_line");
    const u = await e.updateLine({ hint: "the pizza" }, { size: "large" });
    expect(!u.ok && u.code).toBe("ambiguous_line");
    expect(!u.ok && u.needsInfo).toBe(true);
  });
});

describe("combo pick edits", () => {
  it("edits one pick by pickId, replaces another, removes one (slot goes unmet → needs_info)", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "cb_double", quantity: 1, picks: [{ menuItemId: "pz_large", toppings: [{ name: "pepperoni", placement: "whole" }] }, { menuItemId: "pz_large", toppings: [{ name: "chicken", placement: "left" }] }, { menuItemId: "dr_coke" }] });
    expect(e.getLine("L1")!.status).toBe("complete");
    const u = await e.updateLine({ lineId: "L1" }, { picks: [{ pickId: "P2", addToppings: [{ name: "cheddar", placement: "left" }, { name: "red onion", placement: "left" }] }] });
    expect(u.ok).toBe(true);
    const picks = (e.getLine("L1")!.intent as ComboIntent).picks;
    // Combo pick toppings keep the caller's spoken names (matching is case/stem-insensitive).
    expect(picks[1].toppings!.map((t) => t.name)).toEqual(["chicken", "cheddar", "red onion"]);
    expect(picks[0].toppings!.map((t) => t.name)).toEqual(["pepperoni"]); // untouched
    const rm = await e.updateLine({ lineId: "L1" }, { picks: [{ pickId: "P3", remove: true }] });
    expect(rm.ok).toBe(true);
    expect(e.getLine("L1")!.status).toBe("needs_info");
    expect(e.getLine("L1")!.questions[0]).toMatch(/Drink/);
    const back = await e.updateLine({ lineId: "L1" }, { picks: [{ slotLabel: "Drink", menuItemId: "dr_coke" }] });
    expect(back.ok).toBe(true);
    expect(e.getLine("L1")!.status).toBe("complete");
    expect((e.getLine("L1")!.intent as ComboIntent).picks.map((p) => p.pickId)).toEqual(["P1", "P2", "P4"]);
  });
  it("option/size changes addressed at the combo route to the one pick that takes them", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "cb_double", quantity: 1, picks: [{ menuItemId: "pz_large" }, { menuItemId: "pz_large" }, { menuItemId: "dr_coke" }] });
    const u = await e.updateLine({ lineId: "L1" }, { setOptions: ["diet"] });
    expect(u.ok).toBe(true);
    expect((e.getLine("L1")!.intent as ComboIntent).picks[2].options).toEqual(["diet"]);
    // Two pizza picks: a bare size is ambiguous, never guessed.
    const s = await e.updateLine({ lineId: "L1" }, { size: "extra large" });
    expect(!s.ok && s.code).toBe("ambiguous_pick");
  });

  it("topping change on a two-pizza combo without a pick is ambiguous_pick", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "cb_double", quantity: 1, picks: [{ menuItemId: "pz_large" }, { menuItemId: "pz_large" }, { menuItemId: "dr_coke" }] });
    const u = await e.updateLine({ lineId: "L1" }, { addToppings: [{ name: "bacon", placement: "whole" }] });
    expect(!u.ok && u.code).toBe("ambiguous_pick");
    expect(!u.ok && u.candidates?.length).toBe(2);
  });
});

describe("security and gating", () => {
  it("unknown ids never reach the compiler", async () => {
    const { e, log } = engine();
    const r = await e.addLine({ menuItemId: "evil_id", quantity: 1 });
    expect(!r.ok && r.code).toBe("unknown_item");
    const c = await e.addLine({ menuItemId: "cb_double", quantity: 1, picks: [{ menuItemId: "not_on_menu" }] });
    expect(!c.ok && c.code).toBe("unknown_item");
    expect(log).toHaveLength(0);
    await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    const u = await e.updateLine({ lineId: "L1" }, { replaceWithItemId: "nope" });
    expect(!u.ok && u.code).toBe("unknown_item");
  });
  it("sold-out and builder-disabled are refused; quantities are clamped", async () => {
    const { e, log } = engine({ allowPizzaCombo: false });
    expect((await e.addLine({ menuItemId: "soldout", quantity: 1 }) as any).code).toBe("sold_out");
    expect((await e.addLine({ menuItemId: "pz_large", quantity: 1 }) as any).code).toBe("builder_disabled");
    expect(log).toHaveLength(0);
    const r = await e.addLine({ menuItemId: "dr_coke", quantity: 18000 });
    expect(r.ok && r.line.quantity).toBe(25);
  });
});

describe("validate / quote / place bookkeeping", () => {
  it("reports blocking problems until the order is complete", async () => {
    const { e } = engine({ callerId: null });
    expect(e.validate().map((p) => p.code)).toEqual(["cart_empty", "fulfilment_missing", "customer_name_missing"]);
    await e.addLine({ menuItemId: "wings", quantity: 1 });
    e.setFulfilment({ type: "delivery" });
    expect(e.validate().map((p) => p.code)).toEqual(["line_incomplete", "address_missing", "customer_name_missing"]);
    e.setFulfilment({ street: "12 Main St", city: "Milton", zip: "L9T 2J3" });
    expect(e.validate().some((p) => p.code === "address_unverified" && !p.blocking)).toBe(true);
    e.recordAddressCheck({ located: true, inside: true, lat: 43.5, lng: -79.9, fee: 3.99 });
    expect(e.deliveryPin()).toEqual({ lat: 43.5, lng: -79.9 });
    e.setFulfilment({ street: "14 Main St" }); // text changed ⇒ pin cleared
    expect(e.deliveryPin()).toBeNull();
    e.recordAddressCheck({ located: true, inside: false, lat: 1, lng: 1 });
    expect(e.validate().some((p) => p.code === "outside_delivery_area" && !p.blocking)).toBe(true); // out-of-zone is NOT a refusal — the order route decides
    await e.updateLine({ lineId: "L1" }, { size: "10 pc" });
    e.setFulfilment({ type: "pickup" });
    e.setCustomer({ name: "Lee" });
    expect(e.validate().filter((p) => p.blocking)).toEqual([]);
  });
  it("a quote is retired by any mutation and by a changed phone; signature is stable across line order", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    await e.addLine({ menuItemId: "dip_garlic", quantity: 1 });
    e.setFulfilment({ type: "pickup" });
    e.setCustomer({ name: "Sam" });
    e.recordQuote({ total: 5.5, discountNames: ["WELCOME"] });
    expect(e.quoteStillApplies()).toBe(true);
    expect(e.setCustomer({ phone: "6476690808" }).phoneChanged).toBe(false); // same as caller ID
    expect(e.quoteStillApplies()).toBe(true);
    expect(e.setCustomer({ phone: "4168338405" }).phoneChanged).toBe(true);
    expect(e.quoteStillApplies()).toBe(false);
    e.recordQuote({ total: 5.5 });
    await e.updateLine({ lineId: "L2" }, { quantity: 2 });
    expect(e.quoteStillApplies()).toBe(false);
    const sig1 = e.signature();
    e.removeLine({ lineId: "L1" });
    await e.addLine({ menuItemId: "dr_coke", quantity: 1 });
    expect(e.signature()).toBe(sig1);
  });
  it("stateForModel carries lines, focus, incomplete, problems, quote staleness and a cartHash that moves on change", async () => {
    const { e } = engine();
    await e.addLine({ menuItemId: "wings", quantity: 1 });
    await e.addLine({ menuItemId: "dr_coke", quantity: 2 });
    e.setFulfilment({ type: "pickup" });
    const s1 = e.stateForModel();
    expect(s1.lines.map((l) => [l.lineId, l.status])).toEqual([["L1", "needs_info"], ["L2", "complete"]]);
    expect(s1.focusLineId).toBe("L2");
    expect(s1.incomplete).toEqual(["L1"]);
    expect(s1.problems.some((p) => p.code === "line_incomplete")).toBe(true);
    expect(s1.customer.phoneSource).toBe("caller_id");
    await e.updateLine({ lineId: "L1" }, { size: "20 pc" });
    const s2 = e.stateForModel();
    expect(s2.cartHash).not.toBe(s1.cartHash);
    expect(s2.incomplete).toEqual([]);
    expect(e.fullReadBack()).toMatch(/^1\. 1× 20 pc Wings 2\. 2× Coke$/);
  });
});
