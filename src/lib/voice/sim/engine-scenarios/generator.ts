/**
 * DETERMINISTIC PERMUTATION GENERATOR for the free engine tier.
 *
 * Builds hundreds of op-script scenarios from Luigi's real menu vocabulary by
 * walking a parameter space — sizes × half/half layouts × topping counts ×
 * whole-pizza extras × preset exclusions × corrections (remove / move /
 * revert / size change / quantity) × combo slot orders — each with the exact
 * expected cart derived from the same construction, so the expectation is a
 * fact about the ops, not a guess. Seeded (mulberry32) ⇒ the same seed always
 * yields the same suite; a failure is reproducible by id.
 *
 * What it proves: resolver → engine → compiler correctness across the space
 * (the directive's "several hundred → 1,000+"), at $0. Interpretation of
 * caller speech is the paid tier's job.
 */
import { L } from "../scenarios/luigis-ids";
import type { CanonicalLine } from "../scenario-types";
import { pizza, simple } from "./index";
import type { EngineOp, EngineScenario } from "./types";

/* ───────────────────────────── vocabulary (Luigi's fixture) ───────────────── */

/** Toppings spoken → the option name the compiler resolves (lowercased for the canonical cart). */
const TOPPINGS: Array<{ say: string; is: string }> = [
  { say: "pepperoni", is: "pepperoni" },
  { say: "mushrooms", is: "mushrooms" },
  { say: "green peppers", is: "green peppers" },
  { say: "onions", is: "onions" },
  { say: "bacon", is: "bacon" },
  { say: "pineapple", is: "pineapple" },
  { say: "black olives", is: "black olives" },
  { say: "jalapeno", is: "jalapeno" },
  { say: "tomatoes", is: "tomatoes" },
  { say: "sausage", is: "sausage" },
  { say: "red onion", is: "red onion" },
  { say: "spinach", is: "spinach" },
];
/** Same-family N-topping pizzas per size (any of the family is an accepted item id). */
const SIZES: Array<{ label: string; ids: string[] }> = [
  { label: "medium", ids: [L.medium1, L.medium2] },
  { label: "large", ids: [L.large1, L.large2, L.large3, L.large5] },
  { label: "extra large", ids: [L.xl1, L.xl2, L.xl3] },
];
const WING_SIZES = ["10", "20", "30"];
const WING_FLAVOURS = ["hot mixed", "mild mixed", "bbq mixed", "hg mixed", "hot on side"];
const DIPS = ["garlic", "ranch", "chipotle", "marinara"];
const POPS = ["coke", "pepsi", "sprite", "diet coke", "ginger ale"];

/* ───────────────────────────── seeded rng ────────────────────────────────── */

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pickN = <T>(rng: () => number, xs: T[], n: number): T[] => {
  const pool = xs.slice();
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};

const t = (name: string, placement: "left" | "right" | "whole") => ({ name, placement });
const pickupNamed: EngineOp[] = [
  { tool: "set_fulfilment", input: { type: "pickup" } },
  { tool: "set_customer", input: { name: "Marco" } },
];

/* ───────────────────────────── generators ────────────────────────────────── */

type Gen = { id: string; title: string; taxonomy: string[]; ops: EngineOp[]; cart: CanonicalLine[] };

/** One pizza built with a layout, then zero or more corrections. */
function pizzaFamily(rng: () => number, n: number): Gen {
  const size = SIZES[n % SIZES.length];
  const item = size.ids[n % size.ids.length];
  const layout = ["whole", "half", "half+whole"][n % 3];
  const [a, b, c, d, e] = pickN(rng, TOPPINGS, 5);
  const ops: EngineOp[] = [];
  let whole: string[] = [];
  let left: string[] = [];
  let right: string[] = [];
  const tax = ["generated", "pizza", layout];
  if (layout === "whole") {
    const count = 1 + (n % 3);
    const use = [a, b, c].slice(0, count);
    ops.push({ tool: "add_to_order", input: { menuItemId: item, toppings: use.map((x) => t(x.say, "whole")) }, said: `${size.label} ${use.map((x) => x.say).join(" and ")}` });
    whole = use.map((x) => x.is);
  } else if (layout === "half") {
    ops.push({ tool: "add_to_order", input: { menuItemId: item, toppings: [t(a.say, "left"), t(b.say, "left"), t(c.say, "right"), t(d.say, "right")] }, said: `${size.label} half ${a.say} and ${b.say} half ${c.say} and ${d.say}` });
    left = [a.is, b.is];
    right = [c.is, d.is];
  } else {
    ops.push({ tool: "add_to_order", input: { menuItemId: item, toppings: [t(a.say, "left"), t(b.say, "right"), t(c.say, "whole")] }, said: `${size.label} half ${a.say} half ${b.say} ${c.say} on the whole thing` });
    left = [a.is];
    right = [b.is];
    whole = [c.is];
  }
  // Corrections, chosen by n so every kind appears many times.
  const correction = n % 6;
  if (correction === 1 && layout !== "whole") {
    // remove one topping from a half
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "that pizza", removeToppings: [{ name: a.say, placement: "left" }] }, said: `take the ${a.say} off the first half` });
    left = left.filter((x) => x !== a.is);
    tax.push("remove_half");
  } else if (correction === 2) {
    // add a whole-pizza extra
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "it", addToppings: [t(e.say, "whole")] }, said: `add ${e.say} on the whole pizza` });
    whole = [...whole, e.is];
    tax.push("add_whole");
  } else if (correction === 3 && layout === "half") {
    // move a topping to the other half
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "the pizza", moveTopping: { name: a.say, to: "right" } }, said: `move the ${a.say} to the other half` });
    left = left.filter((x) => x !== a.is);
    right = [...right, a.is];
    tax.push("move");
  } else if (correction === 4) {
    // change then revert
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "it", addToppings: [t(e.say, "whole")] }, said: `add ${e.say}` });
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "no wait", revertLastChange: true }, said: `no wait, no ${e.say}` });
    tax.push("revert");
  } else if (correction === 5) {
    // quantity two
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "that", quantity: 2 }, said: "make it two of those" });
    tax.push("quantity");
  }
  const qty = correction === 5 ? 2 : 1;
  return {
    id: `G${String(n).padStart(3, "0")}_pizza_${size.label.replace(/\s/g, "")}_${layout}_${["plain", "removehalf", "addwhole", "move", "revert", "qty2"][correction]}`,
    title: `${size.label} pizza, ${layout} layout, correction=${correction}`,
    taxonomy: tax,
    ops,
    cart: [pizza(item, qty, whole, left, right)],
  };
}

/** Wings + dip + pop with a size/flavour/option change and a removal. */
function sidesFamily(rng: () => number, n: number): Gen {
  const ws = WING_SIZES[n % WING_SIZES.length];
  const [f1, f2] = pickN(rng, WING_FLAVOURS, 2);
  const dip = DIPS[n % DIPS.length];
  const [p1, p2] = pickN(rng, POPS, 2);
  const ops: EngineOp[] = [
    { tool: "add_to_order", input: { menuItemId: L.wings, size: ws, options: [f1] }, said: `${ws} ${f1} wings` },
    { tool: "add_to_order", input: { menuItemId: L.dip, quantity: 2, options: [dip] }, said: `two ${dip} dips` },
    { tool: "add_to_order", input: { menuItemId: L.pop, options: [p1] }, said: `a ${p1}` },
  ];
  const variant = n % 4;
  let wingFlavour = f1;
  let pop = p1;
  let dipQty = 2;
  if (variant === 1) {
    ops.push({ tool: "update_line", input: { hint: "the wings", setOptions: [f2] }, said: `actually make the wings ${f2}` });
    wingFlavour = f2;
  } else if (variant === 2) {
    ops.push({ tool: "update_line", input: { hint: `the ${p1}`, setOptions: [p2] }, said: `change the ${p1} to a ${p2}` });
    pop = p2;
  } else if (variant === 3) {
    ops.push({ tool: "update_line", input: { lineId: "L2", hint: "the dip", quantity: 1 }, said: "just one dip" });
    dipQty = 1;
  }
  return {
    id: `G${String(n).padStart(3, "0")}_sides_${ws}_${variant}`,
    title: `wings ${ws} ${f1}, dips, pop; variant ${variant}`,
    taxonomy: ["generated", "sides", ["plain", "flavour", "pop_swap", "dip_qty"][variant]],
    ops,
    cart: [simple(L.wings, 1, [wingFlavour], ws), simple(L.dip, dipQty, [dip]), simple(L.pop, 1, [pop])],
  };
}

/** Double Large Combo with two pizzas in varying layouts, dips, and a pick edit. */
function comboFamily(rng: () => number, n: number): Gen {
  const [a, b, c, d, e] = pickN(rng, TOPPINGS, 5);
  const [dip1] = pickN(rng, DIPS, 1);
  const layout = n % 3;
  const p1 = layout === 0 ? [t(a.say, "whole")] : [t(a.say, "left"), t(b.say, "right")];
  const p2 = layout === 2 ? [t(c.say, "left"), t(d.say, "left"), t(e.say, "right")] : [t(c.say, "whole"), t(d.say, "whole")];
  const ops: EngineOp[] = [
    {
      tool: "add_to_order",
      input: { menuItemId: L.doubleLarge, picks: [{ menuItemId: L.large3, toppings: p1 }, { menuItemId: L.large3, toppings: p2 }, { menuItemId: L.dip, options: [dip1] }, { menuItemId: L.dip, options: [dip1] }] },
      said: "double large combo",
    },
  ];
  const halves1 = layout === 0 ? { left: [], right: [], whole: [a.is] } : { left: [a.is], right: [b.is], whole: [] };
  const halves2 = layout === 2 ? { left: [c.is, d.is], right: [e.is], whole: [] } : { left: [], right: [], whole: [c.is, d.is] };
  const edit = n % 2;
  if (edit === 1) {
    // add a topping to the second pizza's whole
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "second pizza", picks: [{ pickId: "P2", addToppings: [t(a.say, layout === 2 ? "right" : "whole")] }] }, said: `add ${a.say} to the second pizza` });
    if (layout === 2) halves2.right = [...halves2.right, a.is];
    else halves2.whole = [...halves2.whole, a.is];
  }
  return {
    id: `G${String(n).padStart(3, "0")}_combo_${layout}_${edit}`,
    title: `Double Large Combo layout ${layout}, edit ${edit}`,
    taxonomy: ["generated", "combo", edit ? "pick_edit" : "plain"],
    ops,
    cart: [
      {
        item: L.doubleLarge,
        qty: 1,
        options: [],
        picks: [
          { slot: "1st large pizza", item: L.large3, options: [], halves: halves1 },
          { slot: "2nd large pizza", item: L.large3, options: [], halves: halves2 },
          { slot: "dipping sauces", item: L.dip, options: [dip1] },
          { slot: "dipping sauces", item: L.dip, options: [dip1] },
        ],
      },
    ],
  };
}

/** A specialty pizza by name with a preset exclusion and a size change. */
function specialtyFamily(rng: () => number, n: number): Gen {
  const which = n % 2 === 0 ? { id: L.hawaiian, presets: ["pepperoni", "pineapple"], sizes: ["Small", "Medium", "Large", "X Large"] } : { id: L.meatLovers, presets: ["pepperoni", "ground beef", "chicken"], sizes: ["Small", "Medium", "Large", "XL"] };
  const size = which.sizes[n % which.sizes.length];
  const excl = which.presets[n % which.presets.length];
  const [x] = pickN(rng, TOPPINGS.filter((tp) => !which.presets.includes(tp.is)), 1);
  const ops: EngineOp[] = [{ tool: "add_to_order", input: { menuItemId: which.id, size, excludeToppings: [excl] }, said: `${size} ${which.id === L.hawaiian ? "hawaiian" : "meat lovers"} no ${excl}` }];
  const variant = n % 3;
  let sizeOut = size;
  let whole = which.presets.filter((p) => p !== excl);
  if (variant === 1) {
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "it", addToppings: [t(x.say, "whole")] }, said: `add ${x.say}` });
    whole = [...whole, x.is];
  } else if (variant === 2) {
    const other = which.sizes[(which.sizes.indexOf(size) + 1) % which.sizes.length];
    ops.push({ tool: "update_line", input: { lineId: "L1", hint: "make that", size: other }, said: `make that ${other}` });
    sizeOut = other;
  }
  return {
    id: `G${String(n).padStart(3, "0")}_specialty_${which.id === L.hawaiian ? "haw" : "meat"}_${size.replace(/\s/g, "")}_${variant}`,
    title: `${which.id === L.hawaiian ? "Hawaiian" : "Meat Lovers"} ${size} no ${excl}, variant ${variant}`,
    taxonomy: ["generated", "specialty", "exclusion", ["plain", "add", "resize"][variant]],
    ops,
    cart: [{ item: which.id, qty: 1, size: sizeOut.toLowerCase(), options: [], halves: { left: [], right: [], whole }, excluded: [excl] }],
  };
}

export function generateEngineScenarios(opts: { seed?: number; count?: number } = {}): EngineScenario[] {
  const rng = mulberry32(opts.seed ?? 1);
  const out: EngineScenario[] = [];
  const total = opts.count ?? 360;
  const families = [pizzaFamily, pizzaFamily, sidesFamily, comboFamily, specialtyFamily];
  for (let n = 0; n < total; n++) {
    const g = families[n % families.length](rng, n);
    out.push({
      id: g.id,
      title: g.title,
      taxonomy: g.taxonomy,
      ops: [...pickupNamed, ...g.ops],
      expected: { cart: { lines: g.cart }, fulfilment: "pickup", customerName: "Marco" },
    });
  }
  return out;
}
