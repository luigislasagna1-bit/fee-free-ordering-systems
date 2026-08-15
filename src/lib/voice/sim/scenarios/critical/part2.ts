/** Critical suite T14–T25 (see index.ts for conventions). */
import type { Scenario, CanonicalLine } from "../../scenario-types";
import { L, ADDR } from "../luigis-ids";
import { PLACE_IF_DONE } from "../../harness";

const A = (name = "Marco"): Record<string, string> => ({
  "(your|the|a) name|name for the order|who('s| is) (this|it) for|name (should|do) i put": `It's ${name}.`,
  "(best|good|right|correct) number|callback|reach you|call you back|number (i have|on file)|\\d{3} \\d{3} \\d{4}": "Yes, that's the right number.",
  "pick ?up or delivery|delivery or pick ?up|for pickup or": "Pickup.",
  "(is that|does that|do i have that|did i get that|sound) (right|correct|good|ok)\\??|correct\\?$|right\\?$": "Yes, that's right.",
  "(shall|should|can|may) i (go ahead and )?(place|send|put)|place (it|the order|that)\\?|send (it|that) (through|in)\\?|good to go\\?|ready to (place|send)|want me to (place|send)|(place|send) (it|that|the order) (now|for you)\\?": PLACE_IF_DONE,
});
const FAMILY_L: string[] = [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn];
const FAMILY_XL: string[] = [L.xl1, L.xl2, L.xl3, L.buildYourOwn];
const FAMILY_M: string[] = [L.medium1, L.medium2, L.buildYourOwn];
const pizza = (item: string, qty: number, whole: string[], left: string[] = [], right: string[] = [], extra: Partial<CanonicalLine> = {}): CanonicalLine => {
  const fam = FAMILY_L.includes(item) ? FAMILY_L : FAMILY_XL.includes(item) ? FAMILY_XL : FAMILY_M.includes(item) ? FAMILY_M : [];
  return { item, ...(fam.length ? { itemAlt: fam.filter((x) => x !== item) } : {}), qty, options: [], halves: { left, right, whole }, ...extra };
};
const simple = (item: string, qty: number, options: string[] = [], size?: string): CanonicalLine => ({ item, qty, options, ...(size ? { size } : {}) });
const base = (id: string, title: string, taxonomy: string[], turns: any[], expected: Scenario["expected"], name = "Marco", extra: Partial<Scenario> = {}): Scenario => ({
  id,
  title,
  suite: ["critical"],
  restaurant: L.restaurant,
  taxonomy,
  caller: { mode: "script", turns, answers: A(name) },
  expected: { customer: { name }, fulfilment: { type: "pickup" }, ...expected },
  ...extra,
});

export const T14: Scenario = base(
  "T14_fifty_mutations",
  "50 add/change/remove operations in one session",
  ["long", "correction", "mutations", "stress"],
  [
    "Pickup order. Let me build this up.",
    "Add a large pepperoni pizza.",
    "Add a second large pizza, mushrooms and green peppers.",
    "Add ten wings hot mixed.",
    "Make the wings twenty.",
    "Change the wings to mild mixed.",
    "Add a garlic dipping sauce.",
    "Make that two garlic dips.",
    "Add a Coke.",
    "Add a Sprite.",
    "Remove the Sprite.",
    "Add a Diet Coke.",
    "On the first pizza, add mushrooms.",
    "On the first pizza, take the mushrooms off again.",
    "On the second pizza, make the mushrooms only on the left half.",
    "And green peppers on the right half of that one.",
    "Add bacon to the whole second pizza.",
    "Make the second pizza extra large.",
    "Actually make it large again.",
    "Add a garlic bread.",
    "Make the garlic bread the one with cheese instead.",
    "Add a Caesar salad, Caesar dressing.",
    "Change the salad dressing to ranch.",
    "Remove the salad.",
    "Add a large fries.",
    "Make the fries small.",
    "Add another large pepperoni pizza, same as the first one.",
    "Remove that third pizza.",
    "Change the first pizza to double pepperoni.",
    "Actually just regular pepperoni on it.",
    "Add a chocolate lava cake.",
    "Make the Coke a Pepsi.",
    "Add a water bottle.",
    "Remove the water bottle.",
    "Make the wings thirty.",
    "Make the wings twenty again.",
    "Change the wings back to hot mixed.",
    "Add a third garlic dip.",
    "Actually two garlic dips is enough.",
    "Add onions to the second pizza's left half.",
    "Take the onions off again.",
    "Add a medium pizza, half bacon half mushrooms.",
    "Remove the medium pizza.",
    "Add a poutine, small.",
    "Make the poutine large.",
    "Remove the fries.",
    "Add a Sprite.",
    "Make the lava cake two.",
    "Actually just one lava cake.",
    "OK that's everything. Read it back to me.",
    "Yes, place it.",
  ],
  {
    cart: {
      lines: [
        pizza(L.large1, 1, ["pepperoni"]),
        pizza(L.large3, 1, ["bacon"], ["mushrooms"], ["green peppers"]),
        simple(L.wings, 1, ["hot mixed"], "20"),
        simple(L.dip, 2, ["garlic"]),
        simple(L.pop, 1, ["pepsi"]),
        simple(L.pop, 1, ["diet coke"]),
        simple(L.pop, 1, ["sprite"]),
        simple(L.garlicBreadCheese, 1),
        simple(L.poutine, 1, [], "large"),
        simple(L.lavaCake, 1),
      ],
    },
    mustPlace: true,
  },

);
(T14.caller as any).maxTurns = 90;

export const T15: Scenario = base(
  "T15_ambiguous_reference",
  "Two similar pizzas; 'remove the mushrooms from that one' must clarify",
  ["reference", "ambiguity", "pizza"],
  [
    "Pickup please. Two large pizzas: one pepperoni and mushrooms, one bacon and mushrooms.",
    { say: "Remove the mushrooms from that one.", expectClarification: true },
    "The bacon one.",
    "That's it.",
    "Yes go ahead.",
  ],
  {
    cart: { lines: [pizza(L.large2, 1, ["pepperoni", "mushrooms"]), pizza(L.large2, 1, ["bacon"])] },
    mustPlace: true,
    mustClarifyAt: [1],
  },
);

export const T16: Scenario = base(
  "T16_out_of_stock",
  "Sold-out item is refused honestly and the order continues",
  ["availability"],
  ["Pickup order. A large pepperoni pizza and a chocolate lava cake.", "OK, no cake then. That's it.", "Yes."],
  { cart: { lines: [pizza(L.large1, 1, ["pepperoni"])] }, mustPlace: true, mustSay: ["sold out|out of|don'?t have .*lava|not available"] },
  "Marco",
  { backend: { soldOut: [L.lavaCake] } },
);

export const T17: Scenario = base(
  "T17_invalid_modifier",
  "A topping the item doesn't support",
  ["availability", "modifier"],
  ["Pickup. A large pepperoni pizza with truffle shavings.", "OK, skip the truffle. Just pepperoni.", "That's it.", "Yes."],
  // (The cart is the check: no truffle on the ticket. Wording regexes over the whole call proved brittle.)
  { cart: { lines: [pizza(L.large1, 1, ["pepperoni"])] }, mustPlace: true },
);

export const T18: Scenario = base(
  "T18_required_modifier",
  "Try to move on without a required selection (wings sauce)",
  ["required", "simple-items"],
  ["Pickup. Twenty wings please, and that's it.", "Hot mixed.", "Yes, place it."],
  { cart: { lines: [simple(L.wings, 1, ["hot mixed"], "20")] }, mustPlace: true, mustClarifyAt: [0] },
);

export const T19: Scenario = base(
  "T19_customer_corrects_ai",
  "Nabil mishears; the caller corrects; the cart recovers cleanly",
  ["correction", "recovery"],
  [
    "Pickup. A large pizza with pepperoni and mushrooms.",
    "No no — I said pepperoni and BLACK OLIVES, not mushrooms.",
    "That's it.",
    "Yes.",
  ],
  { cart: { lines: [pizza(L.large2, 1, ["pepperoni", "black olives"])] }, mustPlace: true },
);

export const T20: Scenario = base(
  "T20_question_mid_order",
  "Random questions mid-order; cart stays intact",
  ["faq", "context"],
  [
    "Pickup. A large pizza, half pepperoni half mushrooms.",
    "What time do you close tonight?",
    "And where are you located exactly?",
    "OK. Also add ten wings, hot mixed.",
    "That's it.",
    "Yes place it.",
  ],
  { cart: { lines: [pizza(L.large2, 1, [], ["pepperoni"], ["mushrooms"]), simple(L.wings, 1, ["hot mixed"], "10")] }, mustPlace: true },
);

export const T21: Scenario = {
  id: "T21_delivery",
  title: "Realistic delivery order with address validation",
  suite: ["critical"],
  restaurant: L.restaurant,
  taxonomy: ["delivery", "address"],
  caller: {
    mode: "script",
    turns: [
      "Hi, I'd like a delivery please.",
      `${ADDR.street}, ${ADDR.city}, ${ADDR.zip}.`,
      "A large pepperoni pizza and twenty wings hot mixed.",
      "That's everything.",
      "Yes, go ahead.",
    ],
    answers: {
      ...A("Dana"),
      "pick ?up or delivery|delivery or pick ?up": "Delivery.",
      "(what('s| is) the|your|full|street) address|where (are we|am i) delivering|deliver(ing)? to\\?|postal code|postcode|city": `${ADDR.street}, ${ADDR.city}, ${ADDR.zip}.`,
      "buzzer|apartment|unit|instructions": "No, it's a house.",
    },
  },
  expected: {
    cart: { lines: [{ item: L.large1, itemAlt: FAMILY_L.filter((x) => x !== L.large1), qty: 1, options: [], halves: { left: [], right: [], whole: ["pepperoni"] } }, simple(L.wings, 1, ["hot mixed"], "20")] },
    fulfilment: { type: "delivery", address: ADDR.street },
    customer: { name: "Dana" },
    mustPlace: true,
    mustSay: ["deliver[a-z]*[^.?!]{0,40}\\$\\d|\\$\\d[\\d.]*[^.?!]{0,40}deliver|delivery fee"],
  },
};

export const T22: Scenario = base(
  "T22_noisy_input",
  "Transcription-like mistakes and fragments",
  ["noisy", "asr"],
  [
    "yeah hi um pickup uh",
    "large uh peperoni pizza",
    "and and 0.5 mushroom the other 0.5 uh green pepper",
    "no wait that's a second pizza. large. 0.5 mushroom 0.5 green pepper",
    "ten wing hot mix",
    "thats it",
    "yeah",
  ],
  {
    cart: { lines: [pizza(L.large1, 1, ["pepperoni"]), pizza(L.large2, 1, [], ["mushrooms"], ["green peppers"]), simple(L.wings, 1, ["hot mixed"], "10")] },
    mustPlace: true,
  },
);

export const T23: Scenario = base(
  "T23_duplicate_item",
  "'Another pizza exactly like the first one, except no mushrooms'",
  ["duplicate", "reference"],
  ["Pickup. A large pizza with pepperoni, mushrooms and bacon, well done.", "Give me another pizza exactly like that one, except no mushrooms.", "That's it.", "Yes."],
  { cart: { lines: [pizza(L.large3, 1, ["pepperoni", "mushrooms", "bacon"]), pizza(L.large3, 1, ["pepperoni", "bacon"])] }, mustPlace: true },
);

export const T24: Scenario = base(
  "T24_global_vs_specific",
  "'Make both pizzas well done' vs 'only the second one'",
  ["reference", "scope"],
  [
    "Pickup. Two large pizzas: one pepperoni, one Hawaiian.",
    "Make both pizzas well done.",
    "Also, only on the second one, add extra cheese.",
    "That's it.",
    "Yes.",
  ],
  {
    cart: {
      lines: [
        pizza(L.large1, 1, ["pepperoni"], [], [], { note: "well done" }),
        pizza(L.hawaiian, 1, ["pepperoni", "pineapple", "x - cheese"], [], [], { size: "large", note: "well done" }),
      ],
    },
    mustPlace: true,
  },
);

export const T25: Scenario = {
  id: "T25_huge_pizzeria_order",
  title: "The directive's brutal Friday-night order",
  suite: ["critical"],
  restaurant: L.restaurant,
  taxonomy: ["pizza", "half", "combo", "correction", "reference", "faq", "delivery", "long"],
  caller: {
    mode: "script",
    maxTurns: 40,
    turns: [
      "Hi, delivery please.",
      `${ADDR.street}, ${ADDR.city}, ${ADDR.zip}.`,
      "Okay give me two large pizzas. First one half pepperoni and mushrooms, half green peppers, but put bacon on the whole thing.",
      "Second pizza just cheese — actually make that medium.",
      "Then give me the Large and Wings combo, pizza half Hawaiian style — pepperoni and pineapple — half meat lovers, wings hot mixed.",
      "Actually on that combo pizza, no pineapple on the Hawaiian side.",
      "Oh wait, go back to the first pizza and remove mushrooms but only from that half, and add onions to the other half.",
      "What time do you guys close tonight?",
      "Okay great, and add 20 wings, half medium half honey garlic, plus two garlic dipping sauces.",
      "That's everything.",
      "Yes, place it.",
    ],
    answers: {
      ...A("Sam"),
      "pick ?up or delivery|delivery or pick ?up": "Delivery.",
      "(what('s| is) the|your|full|street) address|where (are we|am i) delivering|deliver(ing)? to\\?|postal code|postcode|city": `${ADDR.street}, ${ADDR.city}, ${ADDR.zip}.`,
      "buzzer|apartment|unit|instructions": "It's a house.",
      "pepperoni on both (sides|halves)|both (sides|halves)[^.?!]*pepperoni|keep it on the hawaiian side": "Yes, pepperoni on both halves — the meat lovers half gets everything meat lovers has.",
      "(two|2) (separate|orders of|lots of) (ten|10)|split (them|the wings)|10 and 10|two tens": "Yes, two orders of ten is fine.",
      "(wings?[^.?!]*(flavou?r|tossed|on the side|separate|split|sauce|mild)|(flavou?r|tossed|on the side|separate|split|sauce|mild)[^.?!]*wings?)[^.?!]*\\?": "Mixed please — two orders of ten: one mild mixed, one honey garlic mixed.",
    },
  },
  expected: {
    cart: {
      lines: [
        { item: L.large3, itemAlt: FAMILY_L.filter((x) => x !== L.large3), qty: 1, options: [], halves: { left: ["pepperoni"], right: ["green peppers", "onions"], whole: ["bacon"] } },
        { item: L.medium1, itemAlt: [L.medium2, L.buildYourOwn], qty: 1, options: [], halves: { left: [], right: [], whole: [] } },
        {
          item: L.largeWings,
          qty: 1,
          options: [],
          picks: [
            { slot: "pizza", item: L.large3, options: [], halves: { left: ["pepperoni"], right: ["pepperoni", "ground beef", "chicken"], whole: [] } },
            { slot: "chicken wings", item: L.wings, options: ["hot mixed"] },
          ],
        },
        simple(L.wings, 1, ["mild mixed"], "10"),
        simple(L.wings, 1, ["hg mixed"], "10"),
        simple(L.dip, 2, ["garlic"]),
      ],
    },
    fulfilment: { type: "delivery", address: ADDR.street },
    customer: { name: "Sam" },
    mustPlace: true,
  },
};

export const CRITICAL_B: Scenario[] = [T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25];
