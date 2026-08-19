import type { VoiceApi } from "./api";
import { captureError } from "./observability";
import type { CallToken } from "./config";
import type { AgentConfig } from "./agent-config";
import { fnv1a } from "./basket-signature";
import { CartEngine, type MutationResult, type OrderState } from "./cart-engine";
import type { MenuIndex } from "./menu-index";
import { spokenMoney } from "./spoken-money";
import { norm, stem } from "./fuzzy";

/**
 * The tools the model may call, and what they do.
 *
 * Every ORDER tool is a thin adapter over the authoritative cart engine
 * (`cart-engine.ts`): the model states intent in names and ids, the engine
 * validates against the call's own menu snapshot, compiles through the same
 * compiler the web store uses, and hands back the canonical order state. The
 * model never sends option ids, never lists items from memory, and never
 * chooses between overlapping tools.
 */
export type ToolContext = {
  token: CallToken;
  cfg: AgentConfig;
  api: VoiceApi;
  cart: CartEngine;
  menu: MenuIndex;
  cashDeliveryBlocked: boolean;
  /** Set by transfer_to_human — the session ends + hands off after the turn. */
  pendingTransfer: string | null;
  /** get_item_options payloads by id — the menu cannot change mid-call. */
  itemOptionsCache: Map<string, unknown>;
  /** Raw combo slots (label/min/max/choices) by combo id — for slot auto-fill. Lazily created. */
  comboSlotsCache?: Map<string, RawSlot[]>;
  /** speakExactly strings handed to the model this turn (claims guard). */
  speakExactlyThisTurn: string[];
  currency: string;
  /** The caller's words this turn — `hint`s are sanitised against them so the
   *  model cannot smuggle its own interpretation ("that one — the bacon pizza")
   *  past the ambiguity check. */
  lastUserText?: string;
  /** The caller's last few utterances (this turn included, oldest first) —
   *  `halfRecipes` must name a pizza the CALLER named (see recipeNotNamed). */
  recentUserTexts?: string[];
  /** set_fulfilment already asked the caller to spell an unfound street this
   *  call — the second miss takes the order anyway, never asks a third time. */
  addressSpellAsked?: boolean;
};

/** Words in a pizza's name that don't identify it ("Vegetable PIZZA", "the …"). */
const RECIPE_NAME_STOP = new Set([
  "pizza", "pizzas", "the", "a", "an", "and", "with", "half", "special", "specials", "style", "classic", "signature",
  "small", "medium", "large", "extra", "xl", "x", "l", "m", "s", "inch", "in", "topping", "toppings", "combo",
]);

/**
 * RECIPE HALVES ARE FOR PIZZAS THE CALLER NAMED (call cmsw4s0mz, 2026-08-16).
 *
 * The caller said "the other side green pepper, mushroom, and tomato". The model
 * noticed those are the Vegetable Pizza's toppings and sent
 * `halfRecipes:[{right, <Vegetable Pizza>}]` — so every read-back said "half
 * Vegetable Pizza" (a name the caller never used and did not recognise), "no
 * tomato" then matched a recipe topping instead of a listed one, and the quote
 * read "half Vegetable Pizza with onions and tomatoes" → "No. You have the
 * toppings wrong." A LIST OF TOPPINGS IS A LIST OF TOPPINGS, even when it
 * happens to match a menu pizza.
 *
 * True when none of the recipe's distinctive name words appears in what the
 * caller actually said (last few utterances, spoken aliases applied so "veggie"
 * finds "Vegetable"). Unjudgeable inputs (no caller text, a name with no
 * distinctive word) return false — the check only ever blocks what it can prove.
 */
export function recipeNotNamed(recipeName: string, saidTexts: string[] | undefined): boolean {
  if (!saidTexts || !saidTexts.length) return false;
  const nameTokens = norm(recipeName).split(" ").filter((t) => t && !RECIPE_NAME_STOP.has(t));
  if (!nameTokens.length) return false;
  const said = norm(saidTexts.join(" ")).split(" ").filter(Boolean);
  if (!said.length) return false;
  const tokMatch = (n: string, w: string) => n === w || stem(n) === stem(w) || (w.length >= 3 && n.startsWith(w)) || (n.length >= 3 && w.startsWith(n));
  return !nameTokens.some((n) => said.some((w) => tokMatch(n, w)));
}

/** The halfRecipes ids a change/add asks for that are NOT already on the line
 *  (an unchanged recipe re-sent with a topping edit needs no re-justifying). */
export function newRecipeIds(requested: unknown, existing: Array<{ menuItemId: string }> | undefined): string[] {
  const asked = Array.isArray(requested) ? requested.map((h: any) => String(h?.menuItemId ?? "")).filter(Boolean) : [];
  const have = new Set((existing ?? []).map((h) => h.menuItemId));
  return [...new Set(asked.filter((id) => !have.has(id)))];
}

/** Keep only hint words the caller actually said (plus deixis/ordinals). */
export function sanitizeHint(hint: unknown, lastUserText: string | undefined): string | undefined {
  if (typeof hint !== "string" || !hint.trim()) return undefined;
  if (!lastUserText) return hint;
  const said = new Set(lastUserText.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean));
  const stemOf = (w: string) => w.replace(/e?s$/, "");
  const saidStems = new Set([...said].map(stemOf));
  const kept = hint
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => said.has(w) || saidStems.has(stemOf(w)) || /^(that|this|it|one|first|second|third|fourth|fifth|last|both|the|a|an|l\d+)$/.test(w));
  return kept.length ? kept.join(" ") : undefined;
}

/** Caps on the on-demand item lookup — this payload lands in the CONVERSATION. */
const MAX_OPTION_GROUPS = 8;
const MAX_OPTIONS_PER_GROUP = 40;
const MAX_SLOT_CHOICES = 40;

const TOPPING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Topping as the caller said it, e.g. 'mushrooms'." },
    placement: {
      type: "string",
      enum: ["whole", "left", "right"],
      description: "REQUIRED. 'whole' for an ordinary pizza; on a half-and-half say 'left' or 'right' for EVERY topping — never leave it to be guessed.",
    },
    count: { type: "integer", minimum: 1, description: "2 = double that topping." },
  },
  required: ["name", "placement"],
};
const REMOVE_TOPPING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    placement: { type: "string", enum: ["whole", "left", "right"], description: "Omit = take it off everywhere." },
  },
  required: ["name"],
};
const MOVE_TOPPING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { name: { type: "string" }, to: { type: "string", enum: ["whole", "left", "right"] } },
  required: ["name", "to"],
};
const PIZZA_FIELDS = {
  size: { type: "string", description: "Spoken size, e.g. 'large', 'extra large', '10 pc'." },
  crust: { type: "string", description: "Only if the caller named one." },
  sauce: { type: "string", description: "Only if the caller named one." },
  cheese: { type: "string", description: "Only if the caller named one." },
  toppings: { type: "array", items: TOPPING_SCHEMA, description: "Toppings the caller wants ON it, exactly the ones they LISTED — even if that list happens to match a menu pizza's recipe (a caller who lists 'green pepper, mushroom, tomato' gets those three toppings, not 'half Vegetable Pizza'). 'no onions' is NOT a topping — use excludeToppings. When the caller SAID a pizza's NAME ('half Hawaiian'), do not copy its toppings here — use halfRecipes." },
  halfRecipes: {
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        placement: { type: "string", enum: ["left", "right", "whole"], description: "Which side is built to that recipe ('whole' = the whole pizza, e.g. a Build Your Own made 'Hawaiian style')." },
        menuItemId: { type: "string", description: "The NAMED pizza's menuItemId from the menu / find_menu_item (e.g. Philly Steak Pizza)." },
      },
      required: ["placement", "menuItemId"],
    },
    description:
      "ONLY when the caller SAYS a menu pizza's NAME for a side ('half Philly Steak, half Deluxe', 'half Hawaiian', 'make the other side veggie'): that side is built to the NAMED recipe. Send the recipe pizza's id and side — the system adds its toppings, puts anything both sides share on the whole pizza, carries its base sauce as a kitchen note, and reads it back by name. No get_item_options needed. Any EXTRA toppings the caller adds on that side go in `toppings` with the same placement. NEVER infer a recipe from a list of toppings — the tool refuses a recipe the caller did not name (recipe_not_named).",
  },
  excludeToppings: { type: "array", items: { type: "string" }, description: "Standard toppings to LEAVE OFF a named pizza or a recipe half ('no pineapple on the Hawaiian half')." },
  notes: { type: "string", description: "Kitchen note for this item (well done, cut in squares…)." },
};
const PICK_ADD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    slotLabel: { type: "string", description: "The slot this pick is for, as get_item_options labelled it (e.g. 'Drink'). When a slot has only ONE possible item (a combo's fixed pizza or wings), the slotLabel alone is enough — the system fills the item." },
    menuItemId: { type: "string", description: "The chosen item's menuItemId EXACTLY as get_item_options gave it for that slot (needed only when the slot offers a choice)." },
    quantity: { type: "integer", minimum: 1, description: "How many IDENTICAL picks this entry stands for ('four Cokes' in a choose-4 slot = one entry with quantity 4)." },
    options: { type: "array", items: { type: "string" }, description: "Choices by NAME for a non-pizza pick (dip flavour, wing sauce)." },
    ...PIZZA_FIELDS,
  },
  required: [],
};
const PICK_CHANGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pickId: { type: "string", description: "From ORDER STATE, e.g. 'P2'. Preferred." },
    slotLabel: { type: "string", description: "Only if you don't know the pickId: the slot name (e.g. 'Drink')." },
    remove: { type: "boolean", description: "Take this pick out of the combo." },
    menuItemId: { type: "string", description: "With pickId: replace that pick with this item. With only slotLabel: ADD this item to that slot (a slot that takes several picks — 'choose 4 pop' — gets one more each time; use quantity for several identical ones)." },
    quantity: { type: "integer", minimum: 1, description: "When adding to a slot: how many identical picks to add." },
    options: { type: "array", items: { type: "string" } },
    addToppings: { type: "array", items: TOPPING_SCHEMA },
    removeToppings: { type: "array", items: REMOVE_TOPPING_SCHEMA },
    moveTopping: MOVE_TOPPING_SCHEMA,
    ...PIZZA_FIELDS,
  },
};

export const TOOLS = [
  {
    name: "find_menu_item",
    description:
      "Look up what the caller asked for on THIS restaurant's menu by name ('large pepperoni', 'the family deal', 'a coke'). Returns ranked candidates with their menuItemId, kind (item/pizza/combo), sizes and whether they're sold out, plus items that exist on other days. Use it whenever you are not certain which menu item they mean; never invent an id.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { query: { type: "string", description: "What the caller said." } },
      required: ["query"],
    },
  },
  {
    name: "get_item_options",
    description:
      "The ONLY source of a pizza's or combo's real sizes, crusts, sauces, toppings, prices and slot choices. The menu in your instructions lists names only, and any list marked '+N more' is truncated. Call this BEFORE saying an option does or doesn't exist and before building a pizza or combo. Lists here can also be capped — a 'truncated' count means there are more.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { menuItemId: { type: "string", description: "The menuItemId from the menu or find_menu_item." } },
      required: ["menuItemId"],
    },
  },
  {
    name: "add_to_order",
    description:
      "Add ONE kind of thing to the order — a simple item, a pizza, or a combo — in the caller's words. Say what they asked for by NAME (sizes, options, toppings and which half each topping goes on); the server resolves names, validates against the menu and prices it. If it can't finish, the line is created anyway with the questions to ask (status needs_info) — ask, then update_line. A COMBO can be added the moment it is named, with no picks: its fixed parts (a slot with a single possible item) are filled for you and only the real choices (toppings, flavour, drink) come back as questions. NEVER add the same item again to change it.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        menuItemId: { type: "string", description: "From the menu or find_menu_item. Omit only with sameAsLineId." },
        quantity: { type: "integer", minimum: 1, description: "How many of this exact thing (default 1)." },
        options: { type: "array", items: { type: "string" }, description: "Choices by NAME for a simple item (wing sauce, dip flavour, side). Never ids." },
        ...PIZZA_FIELDS,
        picks: { type: "array", items: PICK_ADD_SCHEMA, description: "COMBO only: the caller's pick for each slot. A pizza pick carries its own size and toppings." },
        sameAsLineId: { type: "string", description: "Clone that line and then apply the other fields as changes ('same again but no onions')." },
        confirmAnother: { type: "boolean", description: "Set true ONLY after the caller confirmed they want an ADDITIONAL identical item, when the tool asked." },
        removeToppings: { type: "array", items: REMOVE_TOPPING_SCHEMA, description: "Only with sameAsLineId: toppings to drop from the clone." },
      },
    },
  },
  {
    name: "update_line",
    description:
      "Change something already on the order — size, quantity, toppings (add/remove/move between halves), options, crust/sauce/cheese, a combo's picks, notes, or swap to another item. Give the lineId from ORDER STATE and ONLY what changes. The line is rebuilt and re-priced from scratch. If several lines could be meant, it returns candidates — ask the caller, don't guess.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        lineId: { type: "string", description: "From ORDER STATE, e.g. 'L2'." },
        hint: {
          type: "string",
          description:
            "ALWAYS include the caller's own words for WHICH line — VERBATIM, copied from what they said ('that one', 'the bacon one', 'the second pizza'), never your interpretation. Even when you also give lineId. The server double-checks: if the words could mean more than one line it returns candidates and you must ask.",
        },
        revertLastChange: { type: "boolean", description: "Undo the last change on this line ('no wait, that was wrong') — puts it back exactly as it was before." },
        quantity: { type: "integer", minimum: 1 },
        replaceWithItemId: { type: "string", description: "Swap to a different menu item keeping everything else that fits (a day deal, a different size product)." },
        setOptions: { type: "array", items: { type: "string" }, description: "Simple item: the complete new option list." },
        addOptions: { type: "array", items: { type: "string" } },
        removeOptions: { type: "array", items: { type: "string" } },
        addToppings: { type: "array", items: TOPPING_SCHEMA },
        removeToppings: { type: "array", items: REMOVE_TOPPING_SCHEMA },
        moveTopping: MOVE_TOPPING_SCHEMA,
        picks: { type: "array", items: PICK_CHANGE_SCHEMA, description: "COMBO only: edit/replace/remove a pick by pickId, or add a pick for a slot." },
        ...PIZZA_FIELDS,
        toppings: { type: "array", items: TOPPING_SCHEMA, description: "The COMPLETE new topping list (only when the caller restates the whole pizza)." },
      },
    },
  },
  {
    name: "remove_line",
    description: "Take a whole line off the order ('forget the wings'). Give the lineId from ORDER STATE.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { lineId: { type: "string" }, hint: { type: "string", description: "The caller's own words for which line ('the wings', 'that one') — always include; the server checks ambiguity." } },
    },
  },
  {
    name: "set_fulfilment",
    description:
      "Record pickup or delivery. For DELIVERY give the full address the moment you have it — BEFORE taking food: it checks the address against the real delivery zones and returns the delivery fee and any minimum. Call again if the caller corrects the address.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["pickup", "delivery"] },
        street: { type: "string", description: "Street address or place name, as the caller said it ('933 Maple Avenue' or 'Milton Sports Center on Santa Maria Blvd')." },
        city: { type: "string" },
        zip: { type: "string", description: "Postal code — only if the caller offered it unprompted. Never ask for it." },
      },
      required: ["type"],
    },
  },
  {
    name: "set_customer",
    description:
      "Record the caller's name for the order, and ONLY if they gave a DIFFERENT callback number than the caller ID, that number. The caller ID is already known — never ask them to recite it.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { name: { type: "string" }, phone: { type: "string", description: "Only a number DIFFERENT from caller ID." } },
    },
  },
  {
    name: "get_order_state",
    description: "The full authoritative order as it stands (every line with its id and status, fulfilment, customer, what still blocks quoting). Use when the STATE block was collapsed or you need a pick's details.",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "quote_order",
    description:
      "Price the whole order as it stands — tax, delivery and any discount included — and get the exact words to read back. Refuses with the list of problems if anything is unfinished (an incomplete line, no pickup/delivery, no name). ALWAYS call this before place_order and read its speakExactly, then get an explicit yes.",
    input_schema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "place_order",
    description:
      "Send the quoted order to the kitchen. ONLY after quote_order was read back and the caller said yes. NEVER call it twice for the same order — a repeated 'yes' after it succeeded is the caller acknowledging.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { orderNotes: { type: "string", description: "Order-level note (e.g. 'ring the buzzer')." } },
    },
  },
  {
    name: "check_reservation_availability",
    description: "List real open reservation time slots for a date + party size before offering times to the caller.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { date: { type: "string", description: "YYYY-MM-DD" }, partySize: { type: "integer", minimum: 1 } },
      required: ["date", "partySize"],
    },
  },
  {
    name: "book_reservation",
    description: "Book a table at a time returned by check_reservation_availability.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        customerName: { type: "string" },
        customerPhone: { type: "string" },
        partySize: { type: "integer", minimum: 1 },
        date: { type: "string", description: "YYYY-MM-DD" },
        time: { type: "string", description: "HH:MM (24h)" },
        notes: { type: "string" },
      },
      required: ["customerName", "customerPhone", "partySize", "date", "time"],
    },
  },
  {
    name: "transfer_to_human",
    description: "Hand the call to a member of staff. Use when you can't confidently complete what the caller wants, they ask for a person, or you've failed at the same thing twice.",
    input_schema: { type: "object", additionalProperties: false, properties: { reason: { type: "string" } }, required: ["reason"] },
  },
  {
    name: "send_sms_link",
    description: "Text the caller a link (their online-order page, menu, reservation, support, or an order receipt).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { linkType: { type: "string", enum: ["order_online", "menu", "reservation", "support", "receipt"] } },
      required: ["linkType"],
    },
  },
];

const ORDER_TOOLS = new Set(["find_menu_item", "get_item_options", "add_to_order", "update_line", "remove_line", "set_fulfilment", "set_customer", "get_order_state", "quote_order", "place_order"]);

/** The tools the model may call THIS call. Ordering tools need canTakeOrders;
 *  reservations need canBookReservations; texting needs smsConfirmations.
 *  transfer_to_human always survives. Pizza/combo building is gated INSIDE the
 *  engine (`allowPizzaCombo`), so one tool set serves every store. */
export function toolsForConfig(cfg: AgentConfig) {
  return TOOLS.filter((t) => {
    if (ORDER_TOOLS.has(t.name) && !cfg.canTakeOrders) return false;
    if ((t.name === "book_reservation" || t.name === "check_reservation_availability") && !cfg.canBookReservations) return false;
    if (t.name === "send_sms_link" && !cfg.smsConfirmations) return false;
    return true;
  });
}

const digits = (s: string) => (s || "").replace(/\D/g, "");

/** ONE canonical form for a caller's number — bare national digits (NANP "1" dropped).
 *  The sentinel email built from it IS the customer's identity for promos. */
export function canonicalPhone(phone: string): string {
  const d = digits(phone);
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

/** Ensure a two-token name (the /api/orders guard requires first + last). */
export function twoTokenName(name: string): string {
  const n = (name || "").trim();
  return n.split(/\s+/).filter(Boolean).length >= 2 ? n : `${n || "Caller"} (phone)`;
}

/** Deterministic non-routable sentinel email so /api/orders' required-email guard passes. */
export function sentinelEmail(phone: string): string {
  return `voice.${canonicalPhone(phone) || "unknown"}@voice.nabil.invalid`;
}

/** Why a total moved, in the caller's terms. Never guess — an empty string
 *  beats a confident wrong explanation. */
export function describeTotalChange(before: string[], after: string[]): string {
  const lost = before.filter((n) => !after.includes(n));
  if (lost.length) return ` — ${lost.join(" and ")} did not apply`;
  const gained = after.filter((n) => !before.includes(n));
  if (gained.length) return ` — ${gained.join(" and ")} applied`;
  return "";
}

const SMS_DEADLINE_MS = 1500;
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.then(
      (v) => {
        clearTimeout(timer);
        return v;
      },
      (e) => {
        clearTimeout(timer);
        throw e;
      },
    ),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]);
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: (currency || "usd").toUpperCase() }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** Identity + address body shared by quote and place. */
function orderBody(ctx: ToolContext): Record<string, unknown> {
  const cart = ctx.cart;
  const cust = cart.customer();
  const phone = canonicalPhone(cust.phone || ctx.token.from || "") || (cust.phone || ctx.token.from || "");
  const f = cart.fulfilment();
  const body: Record<string, unknown> = {
    restaurantSlug: ctx.token.slug,
    type: f.type,
    items: cart.wireItems(),
    customerName: twoTokenName(cust.name || "Phone Caller"),
    customerPhone: phone,
    customerEmail: sentinelEmail(phone),
    paymentMethod: "cash",
    channel: "voice",
  };
  if (f.type === "delivery") {
    body.deliveryAddress = f.street;
    body.deliveryCity = f.city;
    body.deliveryZip = f.zip;
    const pin = cart.deliveryPin();
    if (pin) {
      body.deliveryLat = pin.lat;
      body.deliveryLng = pin.lng;
    }
  }
  return body;
}

/**
 * The recipe-name gate for add_to_order / update_line: for every halfRecipes
 * list requested (top-level, or per pick) that names a recipe NOT already on
 * the line, the caller must have said that pizza's name in their last few
 * utterances. Returns the refusal to hand back, or null when everything asked
 * for is either already there or was named. Excluded from the struggle count
 * (session.ts) — this is a correction the model can act on in one hop.
 */
function unnamedRecipe(
  ctx: ToolContext,
  entries: Array<[requested: unknown, existing: Array<{ menuItemId: string }> | undefined]>,
): Record<string, unknown> | null {
  const said = ctx.recentUserTexts?.length ? ctx.recentUserTexts : ctx.lastUserText ? [ctx.lastUserText] : undefined;
  if (!said) return null;
  for (const [requested, existing] of entries) {
    for (const id of newRecipeIds(requested, existing)) {
      const name = ctx.menu.get(id)?.name;
      if (!name) continue; // unknown ids are the engine's problem (unknown_item)
      if (!recipeNotNamed(name, said)) continue;
      return {
        error: true,
        code: "recipe_not_named",
        message: `The caller did not say "${name}" — they listed toppings. A list of toppings is a list of toppings, even when it matches a menu pizza: send exactly the toppings they said in \`toppings\` with the side ('left'/'right'/'whole') on each, and no halfRecipes. Only when the caller SAYS a pizza's name ("half Hawaiian", "make the other side veggie") is that side a recipe.`,
        state: ctx.cart.stateForModel(),
        instruction: "Nothing was changed. Call the tool again with the toppings the caller listed (with placement) instead of halfRecipes.",
      };
    }
  }
  return null;
}

/** The engine's MutationResult + the spoken-instruction layer for the model. */
function mutationOut(ctx: ToolContext, r: MutationResult, verb: "added" | "changed" | "removed"): Record<string, unknown> {
  if (!r.ok) {
    return {
      ...r,
      instruction:
        r.code === "ambiguous_line" || r.code === "ambiguous_pick"
          ? "Ask the caller WHICH one in one short question, naming the candidates plainly. Do not change anything until they answer."
          : r.code === "possible_duplicate"
            ? "Ask in one short sentence whether this is a change to that line or an additional one, then act on the answer."
            : r.needsInfo
              ? "Ask the caller the first question, conversationally, then call the tool again with the answer. The order is unchanged."
              : "Tell the caller plainly you couldn't do that one thing and offer an alternative — do not describe internals.",
    };
  }
  ctx.speakExactlyThisTurn.push(r.speakExactly);
  const halves = r.halves;
  const line = r.line;
  const needs = line.status === "needs_info";
  if (r.changed === false) {
    // The change touched nothing. Say so — never "that's fixed now" (call
    // cmsw4s0mz, 2026-08-16: two removals of a topping that lived in a recipe
    // half returned ok and changed nothing; the model announced the fix twice).
    return {
      ...r,
      instruction:
        `NOTHING CHANGED: ${(r.notices ?? []).join("; ") || "that matched nothing on the line"}. Do NOT say it is fixed or changed. ` +
        (needs
          ? `Ask the caller: ${line.questions?.[0] ?? "the missing detail"} — one question.`
          : `Say what IS on it right now — speakExactly, once, naturally — and ask what they'd like different. If they want a topping OFF that comes with a recipe half or the standard build, use excludeToppings (or removeToppings with its name and side); if it is already off, say so.`),
    };
  }
  return {
    ...r,
    instruction:
      (r.pricingNote ? `Weave pricingNote into the recap naturally (it is in words already — tack it on after the item, no "just a heads up" or "just so you know"). ` : "") +
      (r.autoAppliedDeal
        ? `GOOD NEWS: this rings up as our "${r.autoAppliedDeal.dealName}" — saves them ${spokenMoney(Number(r.autoAppliedDeal.saving) || 0)}. Say it naturally as good news in one sentence. It's already on the order at the lower price — do NOT ask permission and do NOT try to swap items for this. `
        : "") +
      (r.switchedTo ? `That size is a different item on this menu, so it was built as "${r.switchedTo.to}" instead of "${r.switchedTo.from}"${r.switchedTo.saving > 0 ? `, which also comes to ${spokenMoney(Number(r.switchedTo.saving) || 0)} less — say so as good news, in plain words (never the menu code name). ` : ". Say it in plain words — the size, not the menu code name — and don't present it as a problem. "}` : "") +
      (needs
        ? `The line is on the order but NOT finished. Ask the caller: ${line.questions?.[0] ?? "the missing detail"} — one question — then call update_line with lineId ${r.lineId}. `
        : `Say speakExactly ONCE, naturally, in one sentence — keep every item, size, topping and half exactly as written (connective words only, never regroup halves), then ` +
          (halves && (halves.left.length || halves.right.length)
            ? (verb === "changed" ? "ask if that's right now. " : "ask what else they'd like — one question. ")
            : verb === "removed"
              ? "ask if that's everything. "
              : "ask what else they'd like. ")) +
      "Never read the item's menu code name if speakExactly doesn't. The total comes from quote_order.",
  };
}

export type RawSlot = { label: string; min: number; max: number; choices: Array<{ name: string; menuItemId: string; sizes?: string[] }> };

/**
 * A combo's slots (from the same item-options lookup get_item_options uses),
 * cached per call. Null when the item isn't a combo or the lookup fails.
 */
async function comboSlotsFor(ctx: ToolContext, comboId: string): Promise<RawSlot[] | null> {
  if (!comboId || ctx.menu.kindOf(comboId) !== "combo") return null;
  ctx.comboSlotsCache ??= new Map();
  if (ctx.comboSlotsCache.has(comboId)) return ctx.comboSlotsCache.get(comboId) ?? null;
  let slots: RawSlot[] | null = null;
  try {
    const res = await ctx.api.itemOptions(ctx.token.slug, comboId);
    const raw = res?.combo?.slots;
    if (Array.isArray(raw)) {
      slots = raw.map((sl: any) => ({
        label: String(sl?.label ?? ""),
        min: Number(sl?.min ?? 0) || 0,
        max: Number(sl?.max ?? 0) || 0,
        choices: (Array.isArray(sl?.choices) ? sl.choices : []).map((c: any) => ({
          name: String(c?.name ?? ""),
          menuItemId: String(c?.menuItemId ?? ""),
          ...(Array.isArray(c?.variants) && c.variants.length ? { sizes: c.variants.map((v: any) => String(v?.name ?? "")) } : {}),
        })),
      }));
    }
  } catch {
    slots = null;
  }
  ctx.comboSlotsCache.set(comboId, slots ?? []);
  return slots;
}

const normLabel = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * SLOT AUTO-FILL (Luigi's 00:10 call, 2026-08-16): "Large and Wings combo" was
 * added with no picks; the model then filled the picks by slot NAME with no
 * ids → refused → guessed a wrong wings id → refused → looked the ids up →
 * third try — 9 s of dead air and "the wings id needed a tweak" spoken aloud.
 * A slot with exactly ONE choice needs no choosing: fill it here.
 *  - `bare` (add with no picks): synthesize `min` picks for every single-choice
 *    slot with min ≥ 1 (a single size rides along), so the combo immediately
 *    holds "Large 3 Topping (no toppings yet)" + "Chicken Wings 20 (flavour
 *    pending)" and the model only ever supplies toppings and flavour.
 *  - any pick naming a slotLabel with no menuItemId → the slot's single choice.
 * Slots with several choices are left to the engine's question, unchanged.
 */
export function autofillPicks(picks: any[] | undefined, slots: RawSlot[] | null, opts: { bare: boolean }): any[] | undefined {
  if (!slots || !slots.length) return picks;
  const single = (sl: RawSlot) => (sl.choices.length === 1 && sl.choices[0].menuItemId ? sl.choices[0] : null);
  const withSize = (c: { menuItemId: string; sizes?: string[] }) => (c.sizes && c.sizes.length === 1 ? { size: c.sizes[0] } : {});
  const list = Array.isArray(picks) ? picks.map((p) => ({ ...(p ?? {}) })) : [];
  if (opts.bare && list.length === 0) {
    const out: any[] = [];
    for (const sl of slots) {
      const c = single(sl);
      if (!c || sl.min < 1) continue;
      for (let i = 0; i < Math.min(sl.min, 12); i++) out.push({ slotLabel: sl.label, menuItemId: c.menuItemId, ...withSize(c) });
    }
    return out.length ? out : undefined;
  }
  for (const p of list) {
    if (p.menuItemId || p.pickId || !p.slotLabel) continue;
    const sl = slots.find((x) => normLabel(x.label) === normLabel(p.slotLabel));
    const c = sl ? single(sl) : null;
    if (c) {
      p.menuItemId = c.menuItemId;
      if (!p.size) Object.assign(p, withSize(c));
    }
  }
  return list;
}

export async function executeTool(name: string, input: any, ctx: ToolContext): Promise<unknown> {
  const { api, cart, menu } = ctx;
  const slug = ctx.token.slug;
  switch (name) {
    case "find_menu_item": {
      const q = String(input?.query ?? "").trim();
      if (!q) return { error: true, code: "missing_query", message: "Say what to look for." };
      const r = menu.search(q);
      // Confidence policy (directive: never guess a menu id): a unique
      // high-confidence hit is used and SAID by name; a near-tie or a weak hit
      // is a question; only when nothing scores can "not on the menu" be said.
      const top = r.candidates[0];
      const runnerUp = r.candidates[1];
      const confident = !!top && top.confidence >= 0.85 && (!runnerUp || runnerUp.confidence < 0.85);
      const plausible = r.candidates.filter((c) => c.confidence >= 0.4);
      return {
        ok: true,
        exact: r.exact,
        confidence: r.confidence,
        sizeHint: r.sizeHint,
        candidates: r.candidates.map((c) => ({
          menuItemId: c.menuItemId,
          name: c.name,
          kind: c.kind,
          category: c.category,
          price: c.price,
          sizes: c.sizes,
          soldOut: c.soldOut,
          confidence: c.confidence,
          matchedOn: c.matchedOn,
          ...(c.todayDeal ? { todayDeal: c.todayDeal } : {}),
        })),
        notToday: r.notToday,
        instruction:
          r.candidates.length === 0 || !plausible.length
            ? r.notToday.length
              ? "That item runs on other days (see notToday) — say which day and offer something from the menu."
              : "Nothing on this menu matches. Say so plainly and offer the closest real item you can find on the menu."
            : confident || r.exact
              ? `The first candidate is the item${top && top.matchedOn !== "name" ? ` (matched by ${top.matchedOn} — say its name, "${top?.name}", so the caller can object)` : ""}. Add it with add_to_order (get_item_options first for a pizza/combo).`
              : `More than one item could match (${plausible.slice(0, 3).map((c) => c.name).join(" / ")}) — say the top two by name and ask which they meant. Never pick for them.`,
      };
    }

    case "get_item_options": {
      const wantedId = String(input?.menuItemId ?? "");
      if (!menu.has(wantedId)) return { error: true, code: "unknown_item", message: "That id isn't on this menu — use find_menu_item." };
      const cached = ctx.itemOptionsCache.get(wantedId);
      if (cached) return cached;
      const res = await api.itemOptions(slug, wantedId);
      const item = res?.item;
      if (!item) return { error: true, message: "I couldn't find that item." };
      const groupsAll = item.modifierGroups ?? [];
      const groups = groupsAll.slice(0, MAX_OPTION_GROUPS).map((g: any) => {
        const all = (g.options ?? []).map((o: any) => (o.priceAdjustment ? `${o.name} (+${money(Number(o.priceAdjustment), ctx.currency)})` : o.name));
        return {
          name: g.name,
          role: g.pizzaRole ?? null,
          required: !!(g.required || (g.minSelect ?? 0) > 0),
          choose: g.maxSelect ? `${g.minSelect ?? 0}-${g.maxSelect}` : `${g.minSelect ?? 0}+`,
          choices: all.slice(0, MAX_OPTIONS_PER_GROUP),
          ...(all.length > MAX_OPTIONS_PER_GROUP ? { truncated: all.length - MAX_OPTIONS_PER_GROUP } : {}),
        };
      });
      const out = {
        name: item.name,
        menuItemId: wantedId,
        sizes: (item.variants ?? []).map((v: any) => ({ name: v.name, price: v.price })),
        groups,
        ...(groupsAll.length > MAX_OPTION_GROUPS ? { groupsTruncated: groupsAll.length - MAX_OPTION_GROUPS } : {}),
        isPizza: !!item.pizzaConfig,
        includedToppings: item.pizzaConfig?.includedToppings ?? null,
        extraToppingPrice: item.pizzaConfig?.extraToppingPrice ?? null,
        allowHalfHalf: item.pizzaConfig?.allowHalfHalf ?? null,
        presetToppings: item.pizzaConfig?.presetToppings ?? null,
        combo: res?.combo
          ? {
              sharedToppings: res.combo.sharedToppings ?? null,
              slots: res.combo.slots.map((s: any) => {
                const upInfo = res.slotUpcharges?.[s.id] as { items?: Record<string, number>; variants?: Record<string, number> } | undefined;
                return {
                  label: s.label,
                  choose: s.min === s.max ? s.min : `${s.min}-${s.max}`,
                  choices: s.choices.slice(0, MAX_SLOT_CHOICES).map((c: any) => {
                    const itemUp = upInfo?.items?.[c.menuItemId];
                    const variants = Array.isArray(c.variants) && c.variants.length ? c.variants : [];
                    const sizes = variants.map((v: any) => {
                      const vKey = `${c.menuItemId}::${v.variantId}`;
                      const vUp = upInfo?.variants?.[vKey];
                      return vUp ? `${v.name} (+${money(vUp, ctx.currency)} upgrade)` : v.name;
                    });
                    return {
                      name: c.name,
                      menuItemId: c.menuItemId,
                      ...(itemUp ? { upgrade: `+${money(itemUp, ctx.currency)}` } : {}),
                      ...(sizes.length ? { sizes } : {}),
                    };
                  }),
                  ...(s.choices.length > MAX_SLOT_CHOICES || s.choicesTruncated ? { truncated: Math.max(0, s.choices.length - MAX_SLOT_CHOICES) || true } : {}),
                };
              }),
            }
          : null,
        instruction:
          "Offer these in natural speech — a couple of options at a time, never a long list. A 'truncated' count means the list goes on: never tell a caller something isn't offered just because it isn't in a truncated list; ask add_to_order and let the server decide. " +
          "For a combo, pass each slot pick's menuItemId to add_to_order EXACTLY as given here, with its slotLabel. If sharedToppings is a number, the combo's pizzas SHARE that many toppings — any split is fine at no extra cost. " +
          "A choice or size marked with an upgrade cost is a PREMIUM pick — say the amount naturally when offering it ('the large Fettuccine Alfredo is five dollars more' or 'that one's an upgrade'). Never hide the extra cost; always mention it BEFORE the caller commits.",
      };
      ctx.itemOptionsCache.set(wantedId, out);
      return out;
    }

    case "add_to_order": {
      const comboId = String(input?.menuItemId ?? "");
      const unnamed = unnamedRecipe(ctx, [
        [input?.halfRecipes, undefined],
        ...(Array.isArray(input?.picks) ? input.picks.map((p: any) => [p?.halfRecipes, undefined] as [unknown, undefined]) : []),
      ]);
      if (unnamed) return unnamed;
      const slots = menu.kindOf(comboId) === "combo" && !input?.sameAsLineId ? await comboSlotsFor(ctx, comboId) : null;
      const picks = slots ? autofillPicks(input?.picks, slots, { bare: !Array.isArray(input?.picks) || input.picks.length === 0 }) : input?.picks;
      const r = await cart.addLine({
        menuItemId: input?.menuItemId,
        quantity: input?.quantity,
        size: input?.size,
        options: input?.options,
        toppings: input?.toppings,
        // A NEW pizza's recipe halves ("half Hawaiian, half pepperoni" in one
        // breath) were dropped here until 2026-08-16 — the schema offered
        // halfRecipes on add_to_order, the engine's freshIntent reads them, and
        // this adapter simply didn't pass them along; combo picks (which ride
        // in `picks`) were unaffected, which is why the gap hid.
        halfRecipes: input?.halfRecipes,
        addToppings: input?.addToppings,
        excludeToppings: input?.excludeToppings,
        crust: input?.crust,
        sauce: input?.sauce,
        cheese: input?.cheese,
        picks,
        notes: input?.notes,
        sameAsLineId: input?.sameAsLineId,
        confirmAnother: input?.confirmAnother === true,
        removeToppings: input?.removeToppings,
      });
      return mutationOut(ctx, r, "added");
    }

    case "update_line": {
      const { lineId, hint, ...changes } = input ?? {};
      if (changes.halfRecipes !== undefined || (Array.isArray(changes.picks) && changes.picks.some((p: any) => p?.halfRecipes !== undefined))) {
        // Only a recipe NEW to the line needs the caller to have named it.
        const t = cart.resolveTarget({ lineId, hint: sanitizeHint(hint, ctx.lastUserText) });
        const line = "line" in t ? t.line : null;
        const existingTop = line && line.kind === "pizza" ? (line.intent as any).halfRecipes : undefined;
        const existingFor = (pc: any) => {
          if (!line || line.kind !== "combo") return undefined;
          const picks = (line.intent as any).picks as Array<{ pickId: string; halfRecipes?: Array<{ menuItemId: string }> }>;
          const p = pc?.pickId ? picks.find((x) => x.pickId.toUpperCase() === String(pc.pickId).toUpperCase()) : undefined;
          // Addressed by pickId: that pick's recipes. Addressed by slot label
          // (or nothing): any recipe already on the line counts as existing —
          // a re-send must never be refused for a naming technicality.
          return p ? p.halfRecipes : picks.flatMap((x) => x.halfRecipes ?? []);
        };
        const unnamed = unnamedRecipe(ctx, [
          [changes.halfRecipes, existingTop],
          ...(Array.isArray(changes.picks) ? changes.picks.map((pc: any) => [pc?.halfRecipes, existingFor(pc)] as [unknown, any]) : []),
        ]);
        if (unnamed) return unnamed;
      }
      if (Array.isArray(changes.picks) && changes.picks.some((p: any) => p && !p.menuItemId && !p.pickId && p.slotLabel)) {
        // Which combo? Resolve the target the same way the engine will, then fill single-choice slots.
        const t = cart.resolveTarget({ lineId, hint: sanitizeHint(hint, ctx.lastUserText) });
        if ("line" in t && t.line.kind === "combo") {
          // A slot that already holds a pick is EDITED by its label (engine
          // semantics); only a slot with no pick yet gets its single choice
          // filled in so the engine can APPEND it.
          const held = new Set(t.line.pickSlots.map((ps) => normLabel(ps.slotLabel)));
          const empty = changes.picks.filter((p: any) => !(p && p.slotLabel && held.has(normLabel(p.slotLabel))));
          const heldOnes = changes.picks.filter((p: any) => p && p.slotLabel && held.has(normLabel(p.slotLabel)));
          const slots = await comboSlotsFor(ctx, t.line.intent.menuItemId);
          changes.picks = [...heldOnes, ...(autofillPicks(empty, slots, { bare: false }) ?? [])];
        }
      }
      const r = await cart.updateLine({ lineId, hint: sanitizeHint(hint, ctx.lastUserText) }, changes);
      return mutationOut(ctx, r, "changed");
    }

    case "remove_line": {
      const r = cart.removeLine({ lineId: input?.lineId, hint: sanitizeHint(input?.hint, ctx.lastUserText) });
      return mutationOut(ctx, r, "removed");
    }

    case "set_fulfilment": {
      const type = input?.type === "delivery" ? "delivery" : input?.type === "pickup" ? "pickup" : null;
      if (!type) return { error: true, code: "bad_type", message: "Say pickup or delivery." };
      if (type === "delivery" && ctx.cashDeliveryBlocked && ctx.cfg.deliveryPaymentMode !== "paid") {
        // Prepaid-only delivery with no phone payment: the honest answer is pickup or a link.
      }
      const res = cart.setFulfilment({ type, street: input?.street, city: input?.city, zip: input?.zip });
      if (type === "pickup") {
        return { ok: true, fulfilment: "pickup", state: cart.stateForModel(), instruction: "Pickup it is. Carry on with the order." };
      }
      const street = String(input?.street ?? "").trim();
      if (!street) {
        return {
          ok: true,
          fulfilment: "delivery",
          addressNeeded: true,
          state: cart.stateForModel(),
          instruction: "Delivery noted. Ask for the full street address — house number and street, city, and postcode — BEFORE taking any food, then call set_fulfilment again with it.",
        };
      }
      if (!res.addressChanged && cart.fulfilment().check) {
        // Same address, already checked — don't re-geocode.
        const c = cart.fulfilment().check!;
        return { ok: true, fulfilment: "delivery", located: c.located, inside: c.inside, deliveryFee: c.fee, minimumOrder: c.minimumOrder, zoneName: c.zoneName, state: cart.stateForModel(), instruction: "Address already checked; carry on." };
      }
      const check = await api.checkAddress({ slug, street, city: input?.city ? String(input.city).trim() : undefined, zip: input?.zip ? String(input.zip).trim() : undefined });
      if (!check.ok) {
        cart.recordAddressCheck({ located: null });
        return {
          ok: true,
          fulfilment: "delivery",
          checked: false,
          state: cart.stateForModel(),
          instruction: "The address couldn't be checked just now. Do NOT mention systems or maps and do NOT refuse — read the address back once, then carry on; the store will confirm the delivery details.",
        };
      }
      const j = check.json ?? {};
      cart.recordAddressCheck({
        located: typeof j.located === "boolean" ? j.located : null,
        inside: typeof j.inside === "boolean" ? j.inside : null,
        lat: typeof j.lat === "number" ? j.lat : null,
        lng: typeof j.lng === "number" ? j.lng : null,
        fee: typeof j.deliveryFee === "number" ? j.deliveryFee : null,
        minimumOrder: typeof j.minimumOrder === "number" ? j.minimumOrder : null,
        zoneName: j.zoneName ?? null,
        freeDeliveryOver: typeof j.freeDeliveryOver === "number" ? j.freeDeliveryOver : null,
      });
      // A street with no city/postcode that the check could not place is not
      // an address yet — ask for the rest NOW, not at quote time (the 22:10
      // call on 2026-08-15 only asked after the whole order was taken).
      const partial = !input?.city && !input?.zip && j.located !== true;
      // A FULL address (number, street, city/postcode) that still can't be
      // found is almost always a misheard street name or number. Read it back
      // ONCE and ask them to spell the street — right now, before any food.
      // (2026-08-16, cmsw4s0mz: "sixty six McKechner Court" became "66
      // McKechnie Court", the check failed, the model said "Got it, thanks" —
      // and 3.5 minutes later the caller had to correct it three times: it was
      // 1166 McEachern Court.) The store-will-confirm fallback stays: an
      // address we can't place must never dead-end the order (2026-08-01).
      const unfound = !partial && j.located === false && !!street;
      const heardBack = [street, input?.city ? String(input.city).trim() : ""].filter(Boolean).join(" in ");
      const spellAskedBefore = ctx.addressSpellAsked === true;
      if (unfound) ctx.addressSpellAsked = true;
      return {
        ok: true,
        fulfilment: "delivery",
        ...j,
        state: cart.stateForModel(),
        ...(partial
          ? { instruction: "That street alone couldn't be placed. Ask for the city and postal code right now — one question — and call set_fulfilment again with the full address before any food; then say the delivery fee plainly." }
          : unfound
            ? {
                heardBack,
                instruction: spellAskedBefore
                  ? `Still not found as spelled. Do NOT ask again and do NOT mention maps or systems: say once, warmly, that you have ${heardBack} and the store will confirm the delivery details, then go straight to the food.`
                  : `That address could not be found as heard — the street name or number is probably off. Do NOT say "got it" and move on, and do NOT mention maps or systems. Read it back ONCE exactly as you have it and ask them to spell the street, in one question: "I have ${heardBack} — could you spell the street name for me, just to be sure?" (they will also correct the number if you misheard it). Then call set_fulfilment again with the spelled street.`,
              }
          : j.located === true && typeof j.deliveryFee === "number"
            ? {
                needsPostalCode: !input?.zip,
                instruction:
                  (typeof j.freeDeliveryOver === "number"
                    ? j.freeDeliveryOver > 0
                      ? `Address found. Say the delivery fee AND, in the same breath, that delivery is free on orders over ${spokenMoney(j.freeDeliveryOver)} ("delivery is ${spokenMoney(Number(j.deliveryFee))}, or free once you're over ${spokenMoney(j.freeDeliveryOver)}") — never the fee alone.`
                      : "Address found. Delivery is FREE here — say so."
                    : "Address found. Tell the caller the delivery fee in one short clause.") +
                  (!input?.zip
                    ? " Then ask for the postal code — one question. If they don't have it, say that's completely fine and move straight to the food — never ask again."
                    : " Then move to the food."),
              }
            : {}),
      };
    }

    case "set_customer": {
      const r = cart.setCustomer({ name: input?.name, phone: input?.phone ? canonicalPhone(String(input.phone)) || String(input.phone) : undefined });
      return {
        ok: true,
        customer: cart.customer(),
        state: cart.stateForModel(),
        instruction: r.phoneChanged
          ? "The callback number changed — if you already quoted a total, quote again before placing (a different number can be a different customer and a different price)."
          : "Noted. Carry on.",
      };
    }

    case "get_order_state": {
      return { ok: true, state: cart.stateForModel(), readBack: cart.fullReadBack() };
    }

    case "quote_order": {
      const problems = cart.validate().filter((p) => p.blocking);
      if (problems.length) {
        return {
          error: true,
          code: "cart_invalid",
          problems,
          state: cart.stateForModel(),
          instruction: "Nothing was quoted. Resolve the first blocking problem with the caller (ask the question, or settle pickup/delivery/name), then quote again.",
        };
      }
      const f = cart.fulfilment();
      const mode = f.type === "delivery" ? ctx.cfg.deliveryPaymentMode : ctx.cfg.pickupPaymentMode;
      if (mode === "paid") {
        return {
          error: true,
          code: "prepayment_required",
          message: `${f.type === "delivery" ? "Delivery" : "Pickup"} orders here must be paid in advance, and paying by phone isn't available yet. Don't quote a total or take the order. Offer to text an ordering link (send_sms_link), or to pass the caller to staff.`,
        };
      }
      const res = await api.dryRunOrder(orderBody(ctx));
      if (!res.ok) {
        return {
          error: true,
          code: res.json?.code,
          message: res.json?.error || "I couldn't price that order.",
          instruction: "Something in the order isn't orderable. Tell the caller plainly what the problem is and fix it with them, or transfer.",
        };
      }
      const q = res.json ?? {};
      const names: string[] = Array.isArray(q.appliedPromoNames) ? q.appliedPromoNames.filter((n: unknown) => typeof n === "string" && n) : [];
      const total = typeof q.total === "number" ? q.total : Number(q.total ?? 0);
      cart.recordQuote({ total, discountNames: names });
      const speak = `${cart.spokenOrder()} ${f.type === "delivery" ? "Delivered" : "For pickup"}, your total comes to ${spokenMoney(total)}, tax included.`;
      ctx.speakExactlyThisTurn.push(speak);
      return {
        ok: true,
        total,
        subtotal: q.subtotal,
        tax: q.tax,
        discount: q.discount,
        discountNames: names,
        deliveryFee: q.deliveryFee,
        serviceFees: q.serviceFees,
        deposits: q.deposits,
        speakExactly: speak,
        state: cart.stateForModel(),
        instruction:
          "Read speakExactly back naturally — the whole order, then the EXACT total in those words (it is authoritative and includes tax). Do NOT mention any discount yet. Then ask for a plain yes. Only call place_order after they say yes; if they change anything, quote again.",
      };
    }

    case "place_order": {
      // A stray second place_order after success (the caller's "yes… yes")
      // gets the same reassurance as the dedupe path, not "can't be placed".
      if (cart.isEmpty() && cart.placedOrders().length) {
        const last = cart.placedOrders()[cart.placedOrders().length - 1];
        return {
          ok: true,
          alreadyPlaced: true,
          orderId: last.orderId,
          orderNumber: last.orderNumber,
          total: last.total,
          instruction: "The order is ALREADY placed — do NOT announce a new one. Reassure the caller it's confirmed and repeat the same total.",
        };
      }
      const problems = cart.validate().filter((p) => p.blocking);
      if (problems.length) {
        return { error: true, code: "cart_invalid", problems, state: cart.stateForModel(), instruction: "The order can't be placed yet — resolve the blocking problems, quote again, then place." };
      }
      if (!cart.quoteStillApplies()) {
        return {
          error: true,
          code: "not_quoted",
          notPlaced: true,
          state: cart.stateForModel(),
          instruction: "The order changed since it was last quoted (or was never quoted). Call quote_order, read the total back, get a yes, then place.",
        };
      }
      if (ctx.token.isDemo) {
        const quoted = cart.lastQuote()!;
        cart.recordPlaced({ orderId: null, orderNumber: "DEMO", total: quoted.total });
        return {
          ok: true,
          orderNumber: "DEMO",
          total: quoted.total,
          instruction: "The order has been confirmed. Thank the caller warmly and let them know this was a demo — their order won't actually be prepared, but that's exactly how a real call would go. Invite them to visit feefreeordering.com/nabil-ai to learn more.",
        };
      }
      const f = cart.fulfilment();
      const mode = f.type === "delivery" ? ctx.cfg.deliveryPaymentMode : ctx.cfg.pickupPaymentMode;
      if (mode === "paid") {
        return {
          ok: false,
          refused: "prepayment_required",
          instruction: `This restaurant requires ${f.type} orders to be paid in advance, and paying by phone isn't available yet. Do NOT place the order. Apologise briefly and offer to text the caller a link so they can order and pay online (send_sms_link), or to pass them to staff.`,
        };
      }
      const signature = cart.signature();
      const prior = cart.placedOrders().find((p) => p.signature === signature);
      if (prior) {
        return {
          ok: true,
          alreadyPlaced: true,
          orderId: prior.orderId,
          orderNumber: prior.orderNumber,
          total: prior.total,
          instruction: "This exact order was ALREADY placed earlier in this call — do NOT announce a new order. Reassure the caller it's confirmed and repeat the SAME total.",
        };
      }
      const quoted = cart.lastQuote()!;
      if (input?.orderNotes) cart.setOrderNotes(input.orderNotes);
      const payload: Record<string, unknown> = {
        ...orderBody(ctx),
        marketingConsent: false,
        idempotencyKey: `voice-${ctx.token.callSid}-${fnv1a(signature)}`,
        notes: cart.orderNotes() ?? undefined,
        expectedTotal: quoted.total,
      };
      let res: { ok: boolean; status: number; json: any };
      try {
        res = await api.placeOrder(payload);
      } catch (e) {
        console.error("[nabil-voice] placeOrder failed", e);
        // Money path: the order may or may not exist on the other side.
        captureError(e, { where: "placeOrder", callSid: ctx.token.callSid, restaurantId: ctx.token.restaurantId });
        return {
          error: true,
          code: "place_order_unknown",
          instruction: "The order MAY or MAY NOT have gone through — do not say either way, and do NOT call place_order again. Tell the caller you're checking and connect them to a member of staff (transfer_to_human).",
        };
      }
      if (!res.ok) {
        if (res.status === 409 && res.json?.code === "total_changed") {
          const newTotal = Number(res.json?.total ?? 0);
          const nowNames: string[] = Array.isArray(res.json?.appliedPromoNames) ? res.json.appliedPromoNames.filter((n: unknown) => typeof n === "string" && n) : [];
          const reason = describeTotalChange(quoted.discountNames, nowNames);
          cart.retireQuote();
          return {
            error: true,
            code: "total_changed",
            notPlaced: true,
            quotedTotal: quoted.total,
            total: newTotal,
            instruction: `THE ORDER WAS NOT PLACED. The real total is ${spokenMoney(newTotal)}, not the ${spokenMoney(quoted.total)} you quoted${reason}. Apologise briefly, tell the caller the correct total plainly, and ask whether they still want it. Call quote_order again and only then place_order after they say yes. Do NOT claim the order is in.`,
          };
        }
        if (res.json?.code === "service_paused") {
          return {
            error: true,
            code: "service_paused",
            notPlaced: true,
            message: ctx.cfg.smsConfirmations
              ? "The kitchen has ordering paused right now, and phone orders can't be scheduled ahead yet. Offer to text the caller the online ordering link (send_sms_link) so they can schedule it for after the pause themselves."
              : "The kitchen has ordering paused right now, and phone orders can't be scheduled ahead yet. Apologize and invite the caller to try again after the pause.",
          };
        }
        return { error: true, code: res.json?.code, notPlaced: true, message: res.json?.error || "Could not place the order." };
      }
      const orderId = res.json?.id != null ? String(res.json.id) : null;
      const orderNumber = res.json?.orderNumber != null ? String(res.json.orderNumber) : "";
      const total = Number(res.json?.total ?? quoted.total);
      cart.recordPlaced({ orderId, orderNumber, total });
      const promoDiscount = Number(res.json?.promoDiscount ?? 0);
      const promoNames: string[] = Array.isArray(res.json?.appliedPromoNames) ? res.json.appliedPromoNames.filter((n: unknown) => typeof n === "string" && n) : [];
      const totalMoved = Math.abs(total - quoted.total) > 0.005;
      const changeReason = totalMoved ? describeTotalChange(quoted.discountNames, promoNames) : "";

      let receiptTexted = false;
      const phone = String(payload.customerPhone ?? "");
      if (ctx.cfg.smsConfirmations && phone && orderNumber) {
        try {
          const sms = await withDeadline(
            api.sendSms({ restaurantId: ctx.token.restaurantId, slug, to: phone, linkType: "receipt", orderId, orderNumber, total }),
            SMS_DEADLINE_MS,
          );
          receiptTexted = !!sms?.ok;
        } catch {
          receiptTexted = false;
        }
      }
      return {
        ok: true,
        orderId,
        orderNumber,
        total,
        receiptTexted,
        quotedTotal: quoted.total,
        ...(totalMoved ? { totalChanged: true } : {}),
        ...(promoDiscount > 0 ? { discountApplied: promoDiscount, discountNames: promoNames } : {}),
        state: cart.stateForModel(),
        instruction:
          (receiptTexted
            ? "Their receipt has ALREADY been texted with the order number and a tracking link — say so, and do NOT read the order number aloud. "
            : "Read the caller their order number clearly — no receipt text could be sent, so it's the only record they'll have. ") +
          (totalMoved ? `⚠️ THE TOTAL CHANGED since you quoted ${spokenMoney(quoted.total)}${changeReason}. Tell the caller plainly what it is now. ` : "") +
          `Confirm the total ${spokenMoney(total)} — it is the authoritative charged amount including tax.` +
          (promoDiscount > 0 ? " A discount was applied automatically — mention it briefly as good news (name it if given) so the total doesn't sound like an error." : "") +
          " Then close warmly. Do not ask if they want anything else.",
      };
    }

    case "check_reservation_availability":
      return api.availability(slug, input.date, input.partySize);

    case "book_reservation": {
      if (ctx.token.isDemo) {
        return {
          ok: true,
          confirmationCode: "DEMO",
          status: "confirmed",
          instruction: "The reservation has been confirmed. Let the caller know this was a demo — no real reservation was made, but that's exactly how a real call would go. Invite them to visit feefreeordering.com/nabil-ai to learn more.",
        };
      }
      const res = await api.bookReservation({
        restaurantSlug: slug,
        customerName: twoTokenName(input.customerName),
        customerPhone: input.customerPhone || ctx.token.from,
        partySize: input.partySize,
        date: input.date,
        time: input.time,
        notes: input.notes,
      });
      if (!res.ok) return { error: true, code: res.json?.code, message: res.json?.error || "Could not book." };
      return { ok: true, confirmationCode: res.json?.confirmationCode, status: res.json?.status };
    }

    case "transfer_to_human":
      ctx.pendingTransfer = String(input?.reason || "caller request");
      return { ok: true, message: "Connecting you to a team member now." };

    case "send_sms_link": {
      const lastOrder = [...cart.placedOrders()].reverse().find((p) => p.orderId);
      const res = await api.sendSms({
        restaurantId: ctx.token.restaurantId,
        slug,
        to: cart.customer().phone || ctx.token.from,
        linkType: input.linkType,
        orderId: lastOrder?.orderId ?? undefined,
      });
      return res.ok
        ? { ok: true, ...(input.linkType === "receipt" && lastOrder?.orderId ? { instruction: "Tell them the text lets them follow the order's progress, not just a receipt." } : {}) }
        : { error: true };
    }

    default:
      return { error: true, message: `Unknown tool ${name}` };
  }
}

/** For the session: which tool results carry a state block. */
export function stateOf(out: unknown): OrderState | null {
  return out && typeof out === "object" && (out as any).state && typeof (out as any).state === "object" ? ((out as any).state as OrderState) : null;
}
