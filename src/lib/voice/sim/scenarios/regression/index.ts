/**
 * REGRESSION SUITE — scenarios derived from real calls that exposed bugs.
 * Each one pins the fix: a regression here means the exact same bug is back.
 */
import type { Scenario, CallerTurn } from "../../scenario-types";
import { L } from "../luigis-ids";
import { PLACE_IF_DONE } from "../../harness";

const DA = (name = "Sam"): Record<string, string> => ({
  "(your|the|a) name|name for the order|who('s| is) (this|it) for|name (should|do) i put": `It's ${name}.`,
  "(best|good|right|correct) number|callback|reach you|call you back|number (i have|on file)|\\d{3} \\d{3} \\d{4}": "Yes, that's the right number.",
  "pick ?up or delivery|delivery or pick ?up|for pickup or": "Delivery.",
  "(is that|does that|do i have that|did i get that|sound) (right|correct|good|ok)\\??|correct\\?$|right\\?$": "Yes, that's right.",
  "(shall|should|can|may) i (go ahead and )?(place|send|put)|place (it|the order|that)\\?|send (it|that) (through|in)\\?|good to go\\?|ready to (place|send)|want me to (place|send)|(place|send) (it|that|the order) (now|for you)\\?": PLACE_IF_DONE,
});

/**
 * Call cmsw4s0mz (2026-08-16): Large / Wings Combo, half-and-half pizza where
 * "one side just cheese" and the other side has 4 toppings. The bugs this pins:
 *  - tomatoes placed as (W) whole instead of on the correct half
 *  - a specialty recipe's preset toppings leaking onto a plain side
 *  - the address correction flow (the caller said "sixty six McKechner Court"
 *    which was "66 McKechnie Court" to ASR, then corrected to 1166 McEachern)
 */
export const R01: Scenario = {
  id: "R_cmsw4s0m",
  title: "Combo half-half: one side plain, one side 4 toppings + address correction",
  suite: ["regression"],
  restaurant: L.restaurant,
  taxonomy: ["regression", "combo", "half", "correction", "delivery"],
  caller: {
    mode: "script",
    turns: [
      "Hi, I'd like to order a Large and Wings combo for delivery please.",
      "One side just cheese, and the other side green pepper, mushroom, and tomato.",
      "Add onion to that side too.",
      "The wings hot on the side please.",
      { say: "Sixty six McKechner Court.", ifAsked: { "address|where|deliver|street": "Sixty six McKechner Court." } },
      { say: "Actually it's 1166 McEachern Court.", ifAsked: { "confirm|verify|correct|spell|check|again|repeat|didn't|couldn't|find": "Actually it's 1166 McEachern Court." } },
      "That's everything.",
      "Yes, place it.",
    ] satisfies CallerTurn[],
    answers: DA(),
    maxTurns: 30,
  },
  expected: {
    cart: {
      lines: [
        {
          item: L.largeWings,
          qty: 1,
          options: [],
          picks: [
            {
              slot: "pizza",
              item: L.large3,
              options: [],
              halves: {
                left: [],
                right: ["green peppers", "mushrooms", "onions", "tomatoes"],
                whole: [],
              },
            },
            { slot: "chicken wings", item: L.wings, options: ["hot on side"] },
          ],
        },
      ],
    },
    fulfilment: { type: "delivery" },
    customer: { name: "Sam" },
    mustPlace: true,
  },
};

/**
 * Temporary Closure (Luigi 2026-08-20): delivery paused from the Nabil
 * dashboard. Nabil must announce the pause unprompted, never take a delivery
 * order, offer pickup, and complete the order as pickup. `paused` carries only
 * `resumesLocal` (no timestamp) so the committed scenario never self-heals as
 * wall-clock time passes.
 */
export const R02: Scenario = {
  id: "R_pause_delivery",
  title: "Delivery paused → announce it, refuse delivery, complete a pickup order",
  suite: ["regression"],
  restaurant: L.restaurant,
  taxonomy: ["regression", "pause", "fulfilment", "pickup"],
  backend: { paused: { delivery: { resumesLocal: "this evening at 8:00 PM" } } },
  caller: {
    mode: "script",
    turns: [
      "Hi, I'd like a large pizza with pepperoni for delivery please.",
      { say: "Oh okay — pickup works then.", ifAsked: { "paused|pick ?up|delivery|instead": "Oh okay — pickup works then." } },
      "That's everything.",
      "Yes, place it.",
    ] satisfies CallerTurn[],
    answers: {
      ...DA(),
      "pick ?up or delivery|delivery or pick ?up|for pickup or": "Pickup, please.",
    },
    maxTurns: 24,
  },
  expected: {
    cart: {
      lines: [
        {
          item: L.large1,
          // Same price for the same toppings across the 1/2/3-topping SKUs —
          // the known duplicate-menu-item coin flip (T12/T19 class).
          itemAlt: [L.large2, L.large3],
          qty: 1,
          options: [],
          halves: { left: [], right: [], whole: ["pepperoni"] },
        },
      ],
    },
    fulfilment: { type: "pickup" },
    customer: { name: "Sam" },
    mustPlace: true,
    mustSay: ["delivery[^.?!]*paused|paused[^.?!]*delivery|not\\s+doing\\s+delivery"],
  },
};

export const REGRESSION: Scenario[] = [R01, R02];
