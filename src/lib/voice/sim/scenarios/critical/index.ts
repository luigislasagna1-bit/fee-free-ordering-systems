/**
 * THE CRITICAL SUITE — directive §22 tests 1–25 on Luigi's real menu.
 * Every scenario here must pass 3/3 before a Nabil release ships.
 *
 * Conventions: the caller says things the way real callers do (no ids, no
 * menu jargon). `answers` are standing replies to Nabil's own questions (name,
 * callback number, pickup/delivery, half-confirmations, "shall I place it?")
 * that do NOT consume the scripted turn. Expected carts are CANONICAL:
 * lowercased fixture option names, halves are an unordered pair, combos as
 * picks with the compiler's slot labels lowercased.
 */
import type { Scenario, CanonicalLine, CallerTurn } from "../../scenario-types";
import { L, ADDR } from "../luigis-ids";
import { PLACE_IF_DONE } from "../../harness";

const CALLER = "+16475550100";

/** Standing answers for a scripted PICKUP caller named Marco. */
const A = (name = "Marco"): Record<string, string> => ({
  "(your|the|a) name|name for the order|who('s| is) (this|it) for|name (should|do) i put": `It's ${name}.`,
  "(best|good|right|correct) number|callback|reach you|call you back|number (i have|on file)|\\d{3} \\d{3} \\d{4}": "Yes, that's the right number.",
  "pick ?up or delivery|delivery or pick ?up|for pickup or": "Pickup.",
  "(is that|does that|do i have that|did i get that|sound) (right|correct|good|ok)\\??|correct\\?$|right\\?$": "Yes, that's right.",
  "(shall|should|can|may) i (go ahead and )?(place|send|put)|place (it|the order|that)\\?|send (it|that) (through|in)\\?|good to go\\?|ready to (place|send)|want me to (place|send)|(place|send) (it|that|the order) (now|for you)\\?": PLACE_IF_DONE,
});

/** Luigi's N-topping pizzas are separate products priced the same for the
 *  same toppings, so a caller who never says "three-topping" may land on any
 *  of the same-size family. */
const FAMILY: Record<string, string[]> = {
  [L.small1]: [L.small1],
  [L.medium1]: [L.medium1, L.medium2, L.buildYourOwn],
  [L.medium2]: [L.medium1, L.medium2, L.buildYourOwn],
  // Build Your Own Pizza (sized variants) is the same food built a different way — accepted too.
  [L.large1]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.large2]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.large3]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.large5]: [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn],
  [L.xl1]: [L.xl1, L.xl2, L.xl3, L.buildYourOwn],
  [L.xl2]: [L.xl1, L.xl2, L.xl3, L.buildYourOwn],
  [L.xl3]: [L.xl1, L.xl2, L.xl3, L.buildYourOwn],
};
const pizza = (item: string, qty: number, whole: string[], left: string[] = [], right: string[] = [], extra: Partial<CanonicalLine> = {}): CanonicalLine => ({
  item,
  ...(FAMILY[item] ? { itemAlt: FAMILY[item].filter((x) => x !== item) } : {}),
  qty,
  options: [],
  halves: { left, right, whole },
  ...extra,
});
const simple = (item: string, qty: number, options: string[] = [], size?: string): CanonicalLine => ({ item, qty, options, ...(size ? { size } : {}) });

const base = (id: string, title: string, taxonomy: string[], turns: CallerTurn[], expected: Scenario["expected"], name = "Marco"): Scenario => ({
  id,
  title,
  suite: ["critical"],
  restaurant: L.restaurant,
  taxonomy,
  caller: { mode: "script", turns, answers: A(name) },
  expected: { customer: { name }, fulfilment: { type: "pickup" }, ...expected },
});

export const T01: Scenario = base(
  "T01_basic",
  "Large pepperoni pizza",
  ["pizza", "basic"],
  ["Hi, I'd like to order a large pepperoni pizza for pickup.", "That's it, thanks.", "Yes, place it."],
  { cart: { lines: [pizza(L.large1, 1, ["pepperoni"])] }, mustPlace: true },
);

export const T02: Scenario = base(
  "T02_multiple_items",
  "Two large pepperoni pizzas, a lasagna and 20 wings",
  ["pizza", "multi-item", "simple-items"],
  [
    "Hi, pickup order please.",
    "Two large pepperoni pizzas, a beef lasagna, and twenty wings, hot mixed.",
    { say: "Regular size lasagna is fine.", ifAsked: { "lasagna|regular or large": "Regular size lasagna is fine." } },
    "That's everything.",
    "Yes, go ahead.",
  ],
  {
    cart: { lines: [pizza(L.large1, 2, ["pepperoni"]), simple(L.lasagna, 1, [], "regular"), simple(L.wings, 1, ["hot mixed"], "20")] },
    mustPlace: true,
  },
);

export const T03: Scenario = base(
  "T03_half_half",
  "Half pepperoni & mushrooms, half green pepper & onions",
  ["pizza", "half"],
  ["Hi, a pickup order please.", "One large pizza — half pepperoni and mushrooms, and the other half green pepper and onions.", "That's all.", "Yes please."],
  { cart: { lines: [pizza(L.large3, 1, [], ["pepperoni", "mushrooms"], ["green peppers", "onions"])] }, mustPlace: true },
);

export const T04: Scenario = base(
  "T04_half_modification",
  "Remove mushrooms from the first half, bacon on the whole pizza",
  ["pizza", "half", "correction"],
  [
    "Pickup please. A large pizza, half pepperoni and mushrooms, other half green peppers and onions.",
    "Actually, take the mushrooms off the pepperoni half, and put bacon on the whole pizza.",
    "That's it.",
    "Yes, place it.",
  ],
  { cart: { lines: [pizza(L.large3, 1, ["bacon"], ["pepperoni"], ["green peppers", "onions"])] }, mustPlace: true },
);

export const T05: Scenario = base(
  "T05_two_complex_pizzas_modify_first",
  "Two different pizzas, then modify only pizza #1",
  ["pizza", "multi-pizza", "reference", "correction"],
  [
    "Hi, pickup order.",
    "First pizza: a large, half pepperoni half mushroom, well done. Second pizza: an extra large with bacon, onions and green olives.",
    "On the first pizza, add green peppers to the mushroom half.",
    "That's everything.",
    "Yes, go ahead.",
  ],
  {
    cart: {
      lines: [
        pizza(L.large2, 1, [], ["pepperoni"], ["mushrooms", "green peppers"]),
        pizza(L.xl3, 1, ["bacon", "onions", "green olives"]),
      ],
    },
    mustPlace: true,
    mustNotSay: ["green peppers? on the (extra large|second|bacon)"],
  },
);

export const T06: Scenario = base(
  "T06_reference_second_pizza",
  "Make the second pizza medium",
  ["pizza", "reference", "size"],
  ["Pickup order please. Two large one-topping pizzas, one pepperoni and one Hawaiian.", "Make the second pizza a medium.", "That's it.", "Yes."],
  {
    cart: { lines: [pizza(L.large1, 1, ["pepperoni"]), pizza(L.hawaiian, 1, ["pepperoni", "pineapple"], [], [], { size: "medium" })] },
    mustPlace: true,
  },
);

export const T07: Scenario = base(
  "T07_combo",
  "Family Feast fully configured",
  ["combo"],
  [
    "Hi, pickup. I'll take the Family Feast.",
    "The pizza pepperoni, wings hot mixed, four Cokes, and two garlic dips.",
    "That's all.",
    "Yes, place it.",
  ],
  {
    cart: {
      lines: [
        {
          item: L.familyFeast,
          qty: 1,
          options: [],
          picks: [
            { slot: "x large pizza", item: L.xl1, options: [], halves: { left: [], right: [], whole: ["pepperoni"] } },
            { slot: "20 chicken wings", item: L.wings, options: ["hot mixed"] },
            { slot: "choose 4 pop", item: L.pop, options: ["coke"] },
            { slot: "choose 4 pop", item: L.pop, options: ["coke"] },
            { slot: "choose 4 pop", item: L.pop, options: ["coke"] },
            { slot: "choose 4 pop", item: L.pop, options: ["coke"] },
            { slot: "choose 2 dip", item: L.dip, options: ["garlic"] },
            { slot: "choose 2 dip", item: L.dip, options: ["garlic"] },
          ],
        },
      ],
    },
    mustPlace: true,
  },
);

export const T08: Scenario = base(
  "T08_combo_change",
  "Change one combo selection after it is complete",
  ["combo", "correction"],
  [
    "Pickup please. The Large and Wings combo — pizza pepperoni, mushrooms and bacon; wings mild mixed.",
    "Actually make the wings hot mixed instead of mild.",
    "That's it.",
    "Yes go ahead.",
  ],
  {
    cart: {
      lines: [
        {
          item: L.largeWings,
          qty: 1,
          options: [],
          picks: [
            { slot: "pizza", item: L.large3, options: [], halves: { left: [], right: [], whole: ["pepperoni", "mushrooms", "bacon"] } },
            { slot: "chicken wings", item: L.wings, options: ["hot mixed"] },
          ],
        },
      ],
    },
    mustPlace: true,
    // (Nabil legitimately reads back "Mild Mixed" before the change — the cart is the check.)
  },
);

export const T09: Scenario = base(
  "T09_combo_half_half_pizza",
  "Half/half pizza inside a combo keeps full builder semantics",
  ["combo", "half"],
  [
    "Hi, pickup. Double Large combo please.",
    "First pizza half pepperoni and mushrooms, other half green peppers and onions. Second pizza just bacon. Two ranch dips.",
    "That's everything.",
    "Yes.",
  ],
  {
    cart: {
      lines: [
        {
          item: L.doubleLarge,
          qty: 1,
          options: [],
          picks: [
            { slot: "1st large pizza", item: L.large3, options: [], halves: { left: ["pepperoni", "mushrooms"], right: ["green peppers", "onions"], whole: [] } },
            { slot: "2nd large pizza", item: L.large3, options: [], halves: { left: [], right: [], whole: ["bacon"] } },
            { slot: "dipping sauces", item: L.dip, options: ["ranch"] },
            { slot: "dipping sauces", item: L.dip, options: ["ranch"] },
          ],
        },
      ],
    },
    mustPlace: true,
  },
);

export const T10: Scenario = base(
  "T10_change_of_mind",
  "Add, modify, remove, add again differently",
  ["correction", "remove", "simple-items"],
  [
    "Pickup order. Twenty wings, hot mixed.",
    "Make that thirty wings.",
    "You know what, forget the wings entirely.",
    "OK add ten wings, mild mixed, and a large fries.",
    "That's it.",
    "Yes place it.",
  ],
  { cart: { lines: [simple(L.wings, 1, ["mild mixed"], "10"), simple(L.fries, 1, [], "large")] }, mustPlace: true },
);

export const T11: Scenario = base(
  "T11_interruption",
  "Interrupt Nabil while it is confirming",
  ["interruption", "pizza"],
  [
    "Pickup please. A large pizza with pepperoni, mushrooms and green peppers.",
    { say: "Wait — no green peppers, make it green olives.", interruptAfterMs: 400 },
    "That's all.",
    "Yes go ahead.",
  ],
  { cart: { lines: [pizza(L.large3, 1, ["pepperoni", "mushrooms", "green olives"])] }, mustPlace: true },
);

export const T12: Scenario = base(
  "T12_long_order",
  "15+ distinct items",
  ["long", "multi-item", "simple-items"],
  [
    "Hi, this is a big pickup order.",
    "Two large pepperoni pizzas and one large Hawaiian.",
    "A medium pizza half mushrooms half bacon.",
    "Twenty wings hot mixed, and ten wings BBQ mixed.",
    "Two garlic breads with cheese, one plain garlic bread, and a large poutine.",
    "A Caesar salad with Caesar dressing, and a beef lasagna, large.",
    "Three garlic dips and two ranch dips.",
    "Four Cokes, two Sprites, and a water bottle.",
    "And a chocolate lava cake.",
    "That's everything.",
    "Yes, place it.",
  ],
  {
    cart: {
      lines: [
        pizza(L.large1, 2, ["pepperoni"]),
        pizza(L.hawaiian, 1, ["pepperoni", "pineapple"], [], [], { size: "large" }),
        pizza(L.medium1, 1, [], ["mushrooms"], ["bacon"]),
        simple(L.wings, 1, ["hot mixed"], "20"),
        simple(L.wings, 1, ["bbq mixed"], "10"),
        simple(L.garlicBreadCheese, 2),
        simple(L.garlicBread, 1),
        simple(L.poutine, 1, [], "large"),
        simple(L.caesar, 1, ["caesar"]),
        simple(L.lasagna, 1, [], "large"),
        simple(L.dip, 3, ["garlic"]),
        simple(L.dip, 2, ["ranch"]),
        simple(L.pop, 4, ["coke"]),
        simple(L.pop, 2, ["sprite"]),
        simple(L.waterBottle, 1),
        simple(L.lavaCake, 1),
      ],
    },
    mustPlace: true,
  },
);

export const T13: Scenario = base(
  "T13_long_call",
  "Many conversational turns; accuracy must not degrade",
  ["long", "conversation", "pizza", "correction"],
  [
    "Hi there, how are you? I want to place a pickup order but I'm still deciding.",
    "What time do you close tonight?",
    "OK. Let's start with a large pizza, half pepperoni half mushroom.",
    "Do you have thin crust?",
    "Make that pizza thin crust then.",
    "Now, my son wants wings. What sauces do you have?",
    "Twenty wings, honey garlic mixed.",
    "Do you deliver to Oakville?",
    "No, pickup is fine.",
    "Add a garlic bread with cheese.",
    "Hmm, actually change the pizza to extra large.",
    "And add green olives to the mushroom half.",
    "How much is a garlic dip?",
    "Add two of the small garlic dipping sauces.",
    "Actually just one garlic dip.",
    "What was the first pizza again?",
    "Great. And one Coke.",
    "That's everything.",
    "Yes, place it.",
  ],
  {
    cart: {
      lines: [
        pizza(L.xl2, 1, [], ["pepperoni"], ["mushrooms", "green olives"], { options: [] }),
        simple(L.wings, 1, ["hg mixed"], "20"),
        simple(L.garlicBreadCheese, 1),
        simple(L.dip, 1, ["garlic"]),
        simple(L.pop, 1, ["coke"]),
      ],
    },
    mustPlace: true,
  },
);

export const CRITICAL_A: Scenario[] = [T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13];
export { CALLER, ADDR };
