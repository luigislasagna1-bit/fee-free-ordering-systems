/**
 * Hand-written engine scenarios — the directive's own examples, expressed as
 * the tool calls a correct model emits, with the exact expected cart. E-ids.
 * Free to run; see types.ts. The permutation generator (generator.ts) adds
 * hundreds more from the same building blocks.
 */
import { L } from "../scenarios/luigis-ids";
import type { CanonicalLine } from "../scenario-types";
import type { EngineOp, EngineScenario } from "./types";

const FAMILY: Record<string, string[]> = {
  [L.large1]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.large2]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.large3]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.large5]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.medium1]: [L.medium1, L.medium2, L.buildYourOwn],
  [L.medium2]: [L.medium1, L.medium2, L.buildYourOwn],
  [L.xl1]: [L.xl1, L.xl2, L.xl3, L.buildYourOwn],
  [L.xl2]: [L.xl1, L.xl2, L.xl3, L.buildYourOwn],
  [L.xl3]: [L.xl1, L.xl2, L.xl3, L.buildYourOwn],
};
export const pizza = (item: string, qty: number, whole: string[], left: string[] = [], right: string[] = [], extra: Partial<CanonicalLine> = {}): CanonicalLine => ({
  item,
  ...(FAMILY[item] ? { itemAlt: FAMILY[item].filter((x) => x !== item) } : {}),
  qty,
  options: [],
  halves: { left, right, whole },
  ...extra,
});
export const simple = (item: string, qty: number, options: string[] = [], size?: string): CanonicalLine => ({ item, qty, options, ...(size ? { size } : {}) });

const t = (name: string, placement: "left" | "right" | "whole" = "whole", count?: number) => ({ name, placement, ...(count ? { count } : {}) });
const add = (input: Record<string, unknown>, said?: string, expect?: EngineOp["expect"]): EngineOp => ({ tool: "add_to_order", input, ...(said ? { said } : {}), ...(expect ? { expect } : {}) });
const upd = (input: Record<string, unknown>, said?: string, expect?: EngineOp["expect"]): EngineOp => ({ tool: "update_line", input, ...(said ? { said } : {}), ...(expect ? { expect } : {}) });
const rm = (input: Record<string, unknown>, said?: string, expect?: EngineOp["expect"]): EngineOp => ({ tool: "remove_line", input, ...(said ? { said } : {}), ...(expect ? { expect } : {}) });
const pickup: EngineOp = { tool: "set_fulfilment", input: { type: "pickup" } };
const named: EngineOp = { tool: "set_customer", input: { name: "Marco" } };

const scn = (id: string, title: string, taxonomy: string[], ops: EngineOp[], cart: CanonicalLine[], extra: Partial<EngineScenario["expected"]> = {}): EngineScenario => ({
  id,
  title,
  taxonomy,
  ops: [pickup, named, ...ops],
  expected: { cart: { lines: cart }, fulfilment: "pickup", customerName: "Marco", ...extra },
});

export const ENGINE_SCENARIOS: EngineScenario[] = [
  scn(
    "E01_luigis_live_call",
    "Luigi's 2026-08-15 pizza, spoken naturally, then the correction he was going to make",
    ["half_half", "correction", "spoken"],
    [
      add({ menuItemId: L.large2, size: "Large", toppings: [t("pepperoni", "left"), t("mushroom", "left"), t("green pepper", "right"), t("onion", "right")] }, "one large pizza half pepperoni and mushroom the other half green pepper and onion", {
        speaks: "a large pizza, half pepperoni and mushrooms, half green peppers and onions",
        mustNotSpeak: "Topping|left half:",
      }),
      upd({ lineId: "L1", hint: "the pizza", removeToppings: [{ name: "mushrooms", placement: "left" }], addToppings: [t("bacon", "whole")] }, "take the mushrooms off the pepperoni half and put bacon on the whole pizza", {
        speaks: "bacon on the whole thing",
      }),
      add({ menuItemId: L.wings, size: "20", options: ["hot mixed"] }, "twenty wings hot mixed", { speaks: "20 piece Chicken Wings, hot mixed" }),
      add({ menuItemId: L.dip, quantity: 2, options: ["garlic"] }, "two garlic dipping sauces", { speaks: "two Dipping Sauce, garlic" }),
    ],
    [pizza(L.large2, 1, ["bacon"], ["pepperoni"], ["green peppers", "onions"]), simple(L.wings, 1, ["hot mixed"], "20"), simple(L.dip, 2, ["garlic"])],
  ),
  scn(
    "E02_remove_that_one_is_ambiguous",
    "two pizzas with mushrooms; 'remove the mushrooms from that one' must ask; 'the bacon one' resolves",
    ["reference", "ambiguity", "correction"],
    [
      add({ menuItemId: L.large2, toppings: [t("pepperoni"), t("mushrooms")] }, "two large pizzas one pepperoni and mushrooms one bacon and mushrooms"),
      { ...add({ menuItemId: L.large2, toppings: [t("bacon"), t("mushrooms")] }, "two large pizzas one pepperoni and mushrooms one bacon and mushrooms", { speaks: "bacon and mushrooms" }), sameTurn: true },
      upd({ hint: "that one", removeToppings: [{ name: "mushrooms" }] }, "remove the mushrooms from that one", { ok: false, code: "ambiguous_line" }),
      upd({ hint: "the bacon one", removeToppings: [{ name: "mushrooms" }] }, "the bacon one"),
    ],
    [pizza(L.large2, 1, ["pepperoni", "mushrooms"]), pizza(L.large2, 1, ["bacon"])],
  ),
  scn(
    "E03_combo_two_pizzas_first_second",
    "Double Large Combo: first pizza half/half, second Hawaiian-style with a half exclusion, two garlic dips; then a pick edit",
    ["combo", "half_half", "exclusion", "pick_edit"],
    [
      add(
        {
          menuItemId: L.doubleLarge,
          picks: [
            { menuItemId: L.large3, toppings: [t("pepperoni", "left"), t("mushroom", "left"), t("bacon", "right"), t("green peppers", "right")] },
            { menuItemId: L.large3, toppings: [t("pepperoni", "left"), t("pineapple", "left"), t("jalapenos", "right")] },
            { menuItemId: L.dip, options: ["garlic"] },
            { menuItemId: L.dip, options: ["garlic"] },
          ],
        },
        "two number four combos first pizza large half pepperoni and mushroom half bacon and green peppers second pizza pepperoni and pineapple on one half jalapenos on the other two garlic dips",
        { speaks: "first pizza large pizza, half pepperoni and mushrooms, half bacon and green peppers" },
      ),
      upd({ lineId: "L1", hint: "second pizza", picks: [{ pickId: "P2", addToppings: [t("onions", "right")] }] }, "add onions to the jalapeno half of the second pizza"),
    ],
    [
      {
        item: L.doubleLarge,
        qty: 1,
        options: [],
        picks: [
          { slot: "1st large pizza", item: L.large3, options: [], halves: { left: ["pepperoni", "mushrooms"], right: ["bacon", "green peppers"], whole: [] } },
          { slot: "2nd large pizza", item: L.large3, options: [], halves: { left: ["pepperoni", "pineapple"], right: ["jalapeno", "onions"], whole: [] } },
          { slot: "dipping sauces", item: L.dip, options: ["garlic"] },
          { slot: "dipping sauces", item: L.dip, options: ["garlic"] },
        ],
      },
    ],
  ),
  scn(
    "E04_reverse_halves_and_move",
    "'same toppings but reverse the halves' as a move; then a whole topping added; then undo",
    ["half_half", "move", "undo"],
    [
      add({ menuItemId: L.large2, toppings: [t("pepperoni", "left"), t("black olives", "right")] }, "large half pepperoni half black olives"),
      upd({ lineId: "L1", hint: "that pizza", toppings: [t("black olives", "left"), t("pepperoni", "right")] }, "actually reverse the halves"),
      upd({ lineId: "L1", hint: "it", addToppings: [t("extra cheese", "whole")] }, "extra cheese on the whole thing"),
      upd({ lineId: "L1", hint: "no wait", revertLastChange: true }, "no wait, no extra cheese"),
    ],
    [pizza(L.large2, 1, [], ["black olives"], ["pepperoni"])],
  ),
  scn(
    "E05_hawaiian_half_no_pineapple_that_half_wait_no",
    "half Hawaiian, half Meat Lovers, no bacon on the meat lovers half (Luigi's menu: Meat Lovers presets are pepperoni/beef/chicken so 'no bacon' is a notice), corrections of corrections",
    ["half_half", "presets", "correction"],
    [
      add({ menuItemId: L.hawaiian, size: "Large", excludeToppings: ["pineapple"] }, "a large hawaiian no pineapple", { speaks: "no pineapple" }),
      upd({ lineId: "L1", hint: "actually", addToppings: [t("pineapple", "whole")] }, "actually keep the pineapple"),
      upd({ lineId: "L1", hint: "it", addToppings: [t("jalapenos", "right")] }, "and jalapenos on half of it"),
    ],
    [{ item: L.hawaiian, qty: 1, size: "large", options: [], halves: { left: [], right: ["jalapeno"], whole: ["pepperoni", "pineapple"] } }],
  ),
  scn(
    "E06_quantities_and_same_again",
    "'make it two', 'same again', 'not both only one', remove by ordinal",
    ["quantity", "reference", "correction"],
    [
      add({ menuItemId: L.wings, size: "10", options: ["hot mixed"] }, "ten hot mixed wings"),
      upd({ lineId: "L1", hint: "the wings", quantity: 2 }, "actually make it two of those"),
      add({ menuItemId: L.pop, options: ["coke"] }, "and a coke"),
      add({ menuItemId: L.pop, options: ["coke"], sameAsLineId: "L2", confirmAnother: true }, "same again"),
      upd({ hint: "the wings", quantity: 1 }, "not both, only one order of wings"),
      rm({ hint: "the second coke" }, "and take off the second coke"),
    ],
    [simple(L.wings, 1, ["hot mixed"], "10"), simple(L.pop, 1, ["coke"])],
  ),
  scn(
    "E07_needs_info_then_completed_not_readded",
    "an incomplete add creates a needs_info line; the answer completes it; a re-add is a duplicate question",
    ["needs_info", "duplicate_guard"],
    [
      add({ menuItemId: L.wings }, "wings please", { mustNotSpeak: "not finished|still need" }),
      upd({ lineId: "L1", size: "20", setOptions: ["bbq mixed"] }, "twenty, bbq"),
      add({ menuItemId: L.wings, size: "20", options: ["bbq mixed"] }, "twenty bbq wings", { ok: false, code: "possible_duplicate" }),
    ],
    [simple(L.wings, 1, ["bbq mixed"], "20")],
  ),
  scn(
    "E08_specialty_by_name_not_rebuilt",
    "a Meat Lovers by name keeps its recipe; 'no beef' excludes a preset; size upgrade",
    ["specialty", "exclusion", "size"],
    [
      add({ menuItemId: L.meatLovers, size: "Medium", excludeToppings: ["ground beef"] }, "medium meat lovers no beef"),
      upd({ lineId: "L1", hint: "make that large", size: "Large" }, "make that a large instead"),
    ],
    [{ item: L.meatLovers, qty: 1, size: "large", options: [], halves: { left: [], right: [], whole: ["pepperoni", "chicken"] }, excluded: ["ground beef"] }],
  ),
  scn(
    "E09_delivery_then_pickup_switch",
    "fulfilment switches mid-order; the cart survives",
    ["fulfilment"],
    [
      { tool: "set_fulfilment", input: { type: "delivery", street: "1 Main St", city: "Milton", zip: "L9T 1A1" } },
      add({ menuItemId: L.large1, toppings: [t("pepperoni")] }, "large pepperoni"),
      { tool: "set_fulfilment", input: { type: "pickup" } },
    ],
    [pizza(L.large1, 1, ["pepperoni"])],
  ),
  scn(
    "E11_bench_t25_explicit_id_with_shared_words",
    "bench T25 (2026-08-15): an explicit lineId whose hint words also fit another line, and 'that combo pizza' after a yes, must NOT be refused as ambiguous",
    ["reference", "combo", "regression"],
    [
      add({ menuItemId: L.large2, toppings: [t("pepperoni", "left"), t("mushrooms", "left"), t("green peppers", "right"), t("bacon", "whole")] }, "two large pizzas first one half pepperoni and mushrooms half green peppers bacon on the whole thing"),
      add({ menuItemId: L.medium1, toppings: [] }, "second pizza just cheese medium"),
      add(
        {
          menuItemId: L.largeWings,
          picks: [
            { slotLabel: "Pizza", menuItemId: L.large3, toppings: [t("pepperoni", "left"), t("pineapple", "left"), t("ground beef", "right"), t("chicken", "right")] },
            { slotLabel: "Chicken Wings", menuItemId: L.wings, size: "20", options: ["Hot Mixed"] },
          ],
        },
        "then the large and wings combo pizza half hawaiian style pepperoni and pineapple half meat lovers wings hot mixed",
      ),
      upd({ lineId: "L1", hint: "go back to the first pizza and remove mushrooms but only from that half, and add onions to the other half", removeToppings: [{ name: "mushrooms", placement: "left" }], addToppings: [t("onions", "right")] }, "go back to the first pizza and remove mushrooms but only from that half and add onions to the other half"),
      // The words fit L3 (pepperoni, halves) AND L1 — an explicit id wins.
      upd({ lineId: "L3", hint: "pepperoni on both halves the meat lovers half gets everything meat lovers has", picks: [{ pickId: "P1", toppings: [t("pepperoni", "whole"), t("pineapple", "left"), t("ground beef", "right"), t("chicken", "right")] }] }, "yes pepperoni on both halves the meat lovers half gets everything meat lovers has"),
      // Pure deixis + explicit id after a confirmation: the focus line (L1) is NOT a veto.
      upd({ lineId: "L3", hint: "that combo pizza, the Large and Wings Combo one", picks: [{ pickId: "P1", excludeToppings: [], removeToppings: [{ name: "pineapple", placement: "left" }] }] }, "yes that's right"),
    ],
    [
      pizza(L.large2, 1, ["bacon"], ["pepperoni"], ["green peppers", "onions"]),
      pizza(L.medium1, 1, []),
      {
        item: L.largeWings,
        qty: 1,
        options: [],
        picks: [
          { slot: "pizza", item: L.large3, options: [], halves: { left: [], right: ["ground beef", "chicken"], whole: ["pepperoni"] } },
          { slot: "chicken wings", item: L.wings, size: "20", options: ["hot mixed"] },
        ],
      },
    ],
  ),
  scn(
    "E12_luigis_half_philly_half_deluxe_combo",
    "Luigi's 21:20 call: Large/Wings combo, pizza half Philly Steak half Deluxe (recipes, overlap → whole, ranch note), wings BBQ, garlic dip, thin crust",
    ["combo", "half_recipe", "regression"],
    [
      add(
        {
          menuItemId: L.largeWings,
          picks: [
            { slotLabel: "Pizza", menuItemId: L.large3, halfRecipes: [{ placement: "left", menuItemId: "cmpuex44806lq04kvesomkta7" }, { placement: "right", menuItemId: "cmpuex52708kk04kv4l0xflwf" }] },
            { slotLabel: "Chicken Wings", menuItemId: L.wings, size: "20", options: ["BBQ Mixed"] },
          ],
        },
        "can I get a pizza and wing combo half philly steak half deluxe barbecue for the wings",
        { speaks: "half Philly Steak Pizza, half Deluxe Pizza", mustNotSpeak: "both halves|double|extra" },
      ),
      add({ menuItemId: L.dip, options: ["garlic"] }, "one garlic sauce", { speaks: "Dipping Sauce, garlic" }),
      upd({ lineId: "L1", hint: "the pizza", picks: [{ pickId: "P1", crust: "thin" }] }, "and can you make the pizza thin crust", { speaks: "thin crust" }),
    ],
    [
      {
        item: L.largeWings,
        qty: 1,
        options: [],
        picks: [
          { slot: "pizza", item: L.large3, options: [], halves: { left: ["steak", "red onion"], right: ["pepperoni"], whole: ["mushrooms", "green peppers"] } },
          { slot: "chicken wings", item: L.wings, size: "20", options: ["bbq mixed"] },
        ],
      },
      simple(L.dip, 1, ["garlic"]),
    ],
  ),
  scn(
    "E13_xl_pizza_named_before_toppings",
    "the 21:15 tester: 'one extra large pizza' goes on the order at once; toppings arrive later as updates, half by half",
    ["needs_info", "half_half", "regression"],
    [
      add({ menuItemId: L.xl1 }, "one extra large pizza", { mustNotSpeak: "not finished|still need" }),
      upd({ lineId: "L1", hint: "it", addToppings: [t("pepperoni", "left")] }, "half pepperoni"),
      upd({ lineId: "L1", hint: "other half", addToppings: [t("chicken", "right"), t("ground beef", "right"), t("red onion", "right"), t("black olives", "right")] }, "other half chicken ground beef red onion black olives"),
    ],
    [pizza(L.xl1, 1, [], ["pepperoni"], ["chicken", "ground beef", "red onion", "black olives"])],
  ),
  scn(
    "E10_gp_hg_aliases",
    "GP / HG / pep / shrooms / x-cheese resolve to the menu's words",
    ["alias", "resolver"],
    [
      add({ menuItemId: L.large3, toppings: [t("GP", "left"), t("pep", "right"), t("shrooms", "right"), t("x cheese", "whole")] }, "large half gp half pep and shrooms x cheese all over"),
      add({ menuItemId: L.wings, size: "10", options: ["hg mixed"] }, "ten hg wings"),
    ],
    [pizza(L.large3, 1, ["x - cheese"], ["green peppers"], ["pepperoni", "mushrooms"]), simple(L.wings, 1, ["hg mixed"], "10")],
  ),
];
