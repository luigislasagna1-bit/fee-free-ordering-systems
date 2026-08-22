/**
 * A5 — ORDER STATUS for orders placed on ANY channel (Luigi 2026-08-22:
 * "when customers call by phone they may be looking for updates for online
 * orders"). Evidence C7: "your order is on its way, any minute now" said with
 * no order at all.
 *
 * The fake backend seeds what lookup_recent_orders finds (the recent-orders
 * route's shape); the scenarios prove the grounding loop end to end — status
 * from the tool, never from memory; third-party orders deflected; cancel /
 * change handed to a person.
 */
import type { Scenario } from "../../scenario-types";
import { L } from "../luigis-ids";

const A: Record<string, string> = {
  "(best|good|right|correct) number|callback|reach you|call you back|number (i have|on file)|\\d{3} \\d{3} \\d{4}": "Yes, that's the right number.",
  "anything else|something else|what else": "No, that's all, thanks.",
  "(text|send) you (the|a) (link|tracking)|track(ing)? link": "No thanks.",
};

const WEB_PICKUP_PREPARING = {
  found: 1,
  orders: [
    {
      id: "ord_web_1",
      orderRef: "4821",
      placedAtIso: "2026-08-22T17:40:00.000Z",
      minutesAgo: 12,
      source: "web",
      thirdParty: false,
      type: "pickup",
      status: "accepted",
      stage: "preparing",
      itemCount: 2,
      items: ["1× Large 2 Topping", "1× Garlic Bread"],
      readyInMinutes: 9,
      scheduledForIso: null,
      dispatch: null,
      matchedBy: "phone",
    },
  ],
};

const WEB_DELIVERY_OUT = {
  found: 1,
  orders: [
    {
      id: "ord_web_2",
      orderRef: "7730",
      placedAtIso: "2026-08-22T17:10:00.000Z",
      minutesAgo: 41,
      source: "app",
      thirdParty: false,
      type: "delivery",
      status: "ready",
      stage: "out_for_delivery",
      itemCount: 3,
      items: ["2× Medium 1 Topping", "1× Coke"],
      readyInMinutes: -5,
      scheduledForIso: null,
      dispatch: { status: "picked_up", dispatchedAtIso: "2026-08-22T17:35:00.000Z" },
      matchedBy: "phone",
    },
  ],
};

const DOORDASH = {
  found: 1,
  orders: [
    {
      id: "ord_dd_1",
      orderRef: "1199",
      placedAtIso: "2026-08-22T17:30:00.000Z",
      minutesAgo: 22,
      source: "doordash",
      thirdParty: true,
      type: "delivery",
      status: "accepted",
      stage: "preparing",
      itemCount: 1,
      items: ["1× Large 3 Topping"],
      readyInMinutes: 6,
      scheduledForIso: null,
      dispatch: { status: null, dispatchedAtIso: null },
      matchedBy: "phone",
    },
  ],
};

const base = (id: string, title: string, recentOrders: unknown, turns: string[], expected: Scenario["expected"], config: Record<string, unknown> = {}): Scenario => ({
  id,
  title,
  suite: ["critical"],
  restaurant: L.restaurant,
  taxonomy: ["order_status", "grounding"],
  backend: { recentOrders, config },
  caller: { mode: "script", turns, answers: A, maxTurns: turns.length + 6 },
  expected,
});

export const S01: Scenario = base(
  "C-STATUS-01_online_pickup_ready",
  "Online pickup order — 'is it ready?' answered from the lookup, with the real ready estimate",
  WEB_PICKUP_PREPARING,
  ["Hi, I placed an order on your website a few minutes ago — is it ready yet?", "Okay great, thanks."],
  {
    cart: { lines: [] },
    mustPlace: false,
    mustSay: ["being prepared", "(about|around|roughly) (nine|9|ten|10) minutes"],
    // "ready for pickup IN about nine minutes" is right; "is ready for pickup" (now) would be a guess.
    mustNotSay: ["on its way", "any minute", "(is|it's) ready for pickup(?! in)", "ready now", "pick ?up or delivery"],
    allowedTools: ["lookup_recent_orders", "send_sms_link", "end_call"],
    maxToolErrors: 0,
  },
);

export const S02: Scenario = base(
  "C-STATUS-02_online_delivery_driver",
  "App delivery order — 'where's my driver?' answered from the dispatch stage, no invented ETA",
  WEB_DELIVERY_OUT,
  ["Hey, I ordered delivery through your app about forty minutes ago, where's my driver?", "Alright, thank you."],
  {
    cart: { lines: [] },
    mustPlace: false,
    mustSay: ["out for delivery|on its way to you"],
    mustNotSay: ["(two|three|four|five|ten|fifteen|twenty) minutes away", "pick ?up or delivery"],
    allowedTools: ["lookup_recent_orders", "send_sms_link", "end_call"],
    maxToolErrors: 0,
  },
);

export const S03: Scenario = base(
  "C-STATUS-03_doordash_deflect",
  "DoorDash order — tracked in their app; Nabil says so and never guesses the driver",
  DOORDASH,
  ["I ordered through DoorDash half an hour ago and the food still isn't here. Where is it?", "Okay, I'll check the app."],
  {
    cart: { lines: [] },
    mustPlace: false,
    mustSay: ["DoorDash"],
    // (Offering to start a fresh order here is allowed — only a guessed driver
    // position or ETA is forbidden.)
    mustNotSay: ["on its way", "(five|ten|fifteen) minutes away"],
    allowedTools: ["lookup_recent_orders", "send_sms_link", "transfer_to_human", "leave_message", "end_call"],
    maxToolErrors: 0,
  },
);

export const S04: Scenario = base(
  "C-STATUS-04_cancel_online_order",
  "'Cancel my online order' — a person's job: looked up, then transferred (immediate policy)",
  WEB_PICKUP_PREPARING,
  // One turn: the hand-off happens on the first ask (immediate policy), so a
  // second scripted line would never be consumed.
  ["I need to cancel the order I just placed online, please."],
  {
    cart: { lines: [] },
    mustPlace: false,
    mustTransfer: true,
    mustNotSay: ["(it's|it is|has been) cancelled", "i('ve| have) cancelled"],
    maxToolErrors: 0,
  },
  { transferPolicy: "immediate" },
);

export const CRITICAL_STATUS: Scenario[] = [S01, S02, S03, S04];
