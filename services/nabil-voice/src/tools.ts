import { api } from "./api";
import type { CallToken } from "./config";
import type { AgentConfig } from "./agent-config";
import { basketSignature, fnv1a } from "./basket-signature";

/**
 * Per-call context handed to every tool executor. The menu / hours / returning
 * caller are fetched once at setup and embedded in the system prompt (grounding
 * + lower latency), so the TOOLS here are the ACTIONS: preview, place order,
 * reservation availability + booking, transfer, SMS.
 */
export type ToolContext = {
  token: CallToken;
  cfg: AgentConfig; // normalized VoiceAgentConfig snapshot (capabilities, gates)
  cashDeliveryBlocked: boolean;
  /** Set by transfer_to_human — the session ends + hands off after the turn. */
  pendingTransfer: string | null;
  /** Orders already placed THIS call, keyed by basket signature — the guard
   *  against the model placing the same order twice (2026-08-10 live dup:
   *  "Yeah."+"Yes." arrived as two prompts → two place_order calls). */
  placedOrders: Array<{ signature: string; orderId: string | null; orderNumber: string; total: number }>;
  /** Lines the SERVER compiled for this call (pizzas + combos). The model never
   *  assembles these — see /api/internal/voice/build-line. Appended by
   *  add_pizza / add_combo and sent by place_order alongside any simple items.
   *  Per-call; runTurn's serialization means no two turns mutate it at once. */
  basket: BuiltLine[];
  /** The number/name the order will actually be placed under, captured the
   *  first time the caller gives one. Pinned so the QUOTE and the CHARGE price
   *  the same customer (promo eligibility is per-customer). ALWAYS canonical —
   *  see orderIdentity, which is the only writer. */
  customerPhone?: string;
  customerName?: string;
  /** The last total quote_order spoke aloud. place_order sends it as
   *  `expectedTotal` so the SERVER refuses to create an order at a price the
   *  caller never heard (409 total_changed, before any write). */
  lastQuotedTotal?: number;
  /** The basket that total was quoted FOR. Without it, a caller who adds a Coke
   *  after the quote trips the "your total changed" warning on a total that
   *  changed for the most ordinary reason there is. Hashed over the MERGED item
   *  set — simple items never enter ctx.basket, they are merged inline. */
  lastQuoteSignature?: string;
  /** Promo names the quote carried, so a moved total can be explained by what
   *  actually changed instead of a hardcoded guess about discounts. */
  lastQuotedDiscountNames?: string[];
  /** menuItemIds the menu flags as PIZZA or COMBO. The model may never send
   *  these as hand-written `items` — they only ever reach an order through the
   *  compiler (add_pizza / add_combo). See mergeBasket. */
  builderItemIds?: Set<string>;
  /** Coordinates check_delivery_address resolved for THIS call's address, and
   *  the address they belong to. Forwarded by quote_order and place_order as
   *  deliveryLat/deliveryLng so the order resolves the SAME zone the caller was
   *  quoted — without them a voice delivery lands in the "unverified" third
   *  state and is billed the restaurant's flat fee instead of the zone's.
   *  Cleared whenever the address changes, so a stale pin can never ride along
   *  with a new street (the same rule the web AddressBook follows). */
  deliveryCoords?: { lat: number; lng: number; forAddress: string } | null;
};

/** Normalized key for "is this the same address I verified?" — case- and
 *  punctuation-insensitive, so "123 Main St." and "123 main st" match.
 *
 *  Street and city collapse whitespace but KEEP word boundaries: the spaces
 *  carry meaning, and a key loose enough to merge two different streets would
 *  let a stale pin ride along with a new address — the money bug this whole
 *  key exists to prevent.
 *
 *  A postcode is the opposite: "L9T 2J3" and "L9T2J3" are the same postcode,
 *  and whether the model writes the space is a coin flip. Strip separators
 *  there so a spoken postcode never invalidates a pin we just resolved. */
export function addressKey(street?: string, city?: string, zip?: string): string {
  const words = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const tight = (s?: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return [words(street), words(city), tight(zip)].filter(Boolean).join("|");
}

/** A compiled order line, exactly as /api/orders wants it. Opaque to the model. */
export type BuiltLine = {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  modifiers: Array<{ modifierOptionId: string; name: string }>;
  notes?: string | null;
  isCombo?: true;
  bundleItems?: Array<{
    menuItemId: string;
    variantId: string | null;
    name: string;
    modifiers: Array<{ modifierOptionId: string; name: string }>;
  }>;
  /** Spoken description kept for read-back; stripped before POSTing. */
  _readBack?: string;
  /** The caller's INTENT that produced this line, kept so a mid-order change
   *  ("make that second pizza half mushroom instead of onion") can be merged
   *  and RECOMPILED through the same compiler. Never patch a compiled payload:
   *  half/half prefixes, per-unit expansion and preset seeding are all decided
   *  at compile time and would drift the moment anyone hand-edited them. */
  _kind?: "pizza" | "combo";
  _intent?: Record<string, unknown>;
  /** What the compiler put on each half, read off the compiled modifiers. The
   *  half-by-half confirmation and the drift check both speak from THIS, never
   *  from the model's memory of the conversation. */
  _halves?: { left: string[]; right: string[]; whole: string[] } | null;
};

/** The running order as the caller would hear it, one numbered line each.
 *  Returned by EVERY basket tool so the model always knows what "the second
 *  pizza" refers to without having to remember. */
function basketView(ctx: ToolContext) {
  return ctx.basket.map((l, i) => ({ line: i + 1, description: l._readBack || "item" }));
}

/** Customer identity for THIS call. quote_order and place_order must price
 *  against the SAME person: promos are keyed on the customer, so quoting as the
 *  caller-ID number and charging as the number they gave can change the total
 *  between the "yes" and the receipt.
 *
 *  🚨 EVERYTHING STORED HERE IS CANONICAL. Occurrence #1 of this bug
 *  (ORD-176217204, 2026-08-11) was "fixed" by canonicalizing only sentinelEmail,
 *  which left the raw string on `customerPhone` — so on 2026-08-13 Roya Safi was
 *  quoted as `+14168338405` (matches none of her three past orders → brand new →
 *  first-time discount → $23.37) and charged as `4168338405` (matches all three →
 *  no discount → $25.97). Same person, two customers, two prices, and she had
 *  already said yes to the wrong one. Canonicalize at the BOUNDARY, once, so no
 *  caller downstream can reintroduce the split. */
function orderIdentity(ctx: ToolContext, input: any) {
  if (typeof input?.customerPhone === "string" && input.customerPhone.trim()) {
    const given = canonicalPhone(input.customerPhone) || input.customerPhone.trim();
    // A caller who gives a DIFFERENT number after being quoted (a spouse's
    // line, a work number) is a different customer to the promo engine, so the
    // quote no longer describes what we would charge. Retire it rather than
    // compare the charge against a total priced for somebody else.
    //
    // Compared against the EFFECTIVE identity, not just an explicitly-set one:
    // the quote almost always runs on caller ID before anyone has been asked,
    // so `ctx.customerPhone` being unset is the normal case and the exact one
    // this has to catch.
    const effective = ctx.customerPhone || canonicalPhone(ctx.token.from || "");
    if (effective && effective !== given) {
      ctx.lastQuotedTotal = undefined;
      ctx.lastQuoteSignature = undefined;
      ctx.lastQuotedDiscountNames = undefined;
    }
    ctx.customerPhone = given;
  }
  if (typeof input?.customerName === "string" && input.customerName.trim()) {
    ctx.customerName = input.customerName.trim();
  }
  const raw = ctx.customerPhone || ctx.token.from;
  return { phone: canonicalPhone(raw) || raw, name: ctx.customerName || "Phone Caller" };
}

/** Why a total moved, in the caller's terms — derived from the promo names the
 *  quote carried versus the ones the charge did.
 *
 *  Never guess. The old code appended "(a discount that did not apply)" to EVERY
 *  changed total, so a delivery-fee or service-fee change would have been
 *  explained to the caller as a discount problem. An empty string is a better
 *  answer than a confident wrong one. */
function describeTotalChange(before: string[], after: string[]): string {
  const lost = before.filter((n) => !after.includes(n));
  if (lost.length) return ` — ${lost.join(" and ")} did not apply`;
  const gained = after.filter((n) => !before.includes(n));
  if (gained.length) return ` — ${gained.join(" and ")} applied`;
  return "";
}

/** How long the receipt text may hold a silent phone line before we give up and
 *  let the agent read the order number aloud instead. */
const SMS_DEADLINE_MS = 1500;

/** Race a promise against a deadline, resolving to `null` on timeout instead of
 *  throwing. Every caller here has an honest fallback, and a rejection inside a
 *  tool hop just becomes a generic "that didn't work" the caller can't act on. */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const done = (v: T | null) => {
    clearTimeout(timer);
    return v;
  };
  return Promise.race([
    p.then(done, (e) => {
      clearTimeout(timer);
      throw e;
    }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]);
}

const ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    menuItemId: { type: "string", description: "The menuItemId from the menu (never invent one)." },
    variantId: { type: "string", description: "Size/variant id, if the item has variants." },
    quantity: { type: "integer", minimum: 1 },
    modifiers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { modifierOptionId: { type: "string" } },
        required: ["modifierOptionId"],
      },
    },
    notes: { type: "string", description: "Special request for this line (kitchen note)." },
  },
  required: ["menuItemId", "quantity"],
};

export const TOOLS = [
  {
    name: "price_order_preview",
    description:
      "Get the authoritative subtotal/total for a set of items BEFORE placing the order, so you can read the correct total back to the caller. Always call this and read back the total before place_order.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["pickup", "delivery"] },
        items: { type: "array", items: ITEM_SCHEMA },
      },
      required: ["type", "items"],
    },
  },
  {
    name: "place_order",
    description:
      "Place the order into the kitchen. ONLY call after you have read the full order + total back and the caller said yes. The server re-prices and re-validates everything. NEVER call this twice for the same order — a repeated confirmation ('yes', 'yeah', 'ok') after you already placed it is the caller acknowledging, NOT a request for another order. Only place a second order if the caller clearly asks for a new, different order.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["pickup", "delivery"] },
        items: {
          type: "array",
          items: ITEM_SCHEMA,
          description:
            "SIMPLE items only — drinks, wings, sides. NEVER a pizza or a combo, and never anything you already added with add_pizza or add_combo: those are already on the order and listing them again would charge the caller twice.",
        },
        customerName: { type: "string", description: "The caller's name, if you have it." },
        customerPhone: {
          type: "string",
          description:
            "OMIT THIS. The caller's own number is already known from caller ID and is used automatically. Only send a number if the caller explicitly gave a DIFFERENT one to use instead.",
        },
        deliveryStreet: { type: "string" },
        deliveryCity: { type: "string" },
        deliveryZip: { type: "string" },
        notes: { type: "string", description: "Order-level note (e.g. 'ring the buzzer')." },
      },
      // customerPhone is NOT required: it is known from caller ID. Requiring it
      // made the model ask for it every time — a tool contract beats a prompt
      // paragraph, so prompt.ts:347's "never make them recite it" lost, and Roya
      // spent 40s of a 205s call dictating a number we already held.
      required: ["type"],
    },
  },
  {
    name: "check_reservation_availability",
    description: "List real open reservation time slots for a date + party size before offering times to the caller.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        date: { type: "string", description: "YYYY-MM-DD" },
        partySize: { type: "integer", minimum: 1 },
      },
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
    name: "get_item_options",
    description:
      "The ONLY source of a pizza's or combo's sizes, crusts, sauces, toppings, prices and slot choices. " +
      "The menu in your system prompt NEVER contains any of them — it lists the item's name and nothing else, so you do " +
      "not know them and cannot infer them. Call this BEFORE you say what is or isn't available, before you quote an " +
      "option price, and before building a pizza or combo. Not 'when you don't know the options' — you never know them.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { menuItemId: { type: "string", description: "The menuItemId from the menu." } },
      required: ["menuItemId"],
    },
  },
  {
    name: "add_pizza",
    description:
      "Add a built pizza to the order. Say WHAT the caller asked for in plain terms — sizes and toppings by name, and which half each topping goes on. Never invent option ids and never write placement prefixes yourself; the server resolves names and writes the order. If anything is unclear it comes back in `unresolved` — ask the caller those questions and call again.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        menuItemId: { type: "string", description: "The pizza's menuItemId." },
        size: { type: "string", description: "Spoken size, e.g. 'large'." },
        crust: { type: "string", description: "Only if the caller named one." },
        sauce: { type: "string", description: "Only if the caller named one." },
        cheese: { type: "string", description: "Only if the caller named one." },
        toppings: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string", description: "Topping as the caller said it, e.g. 'mushrooms'." },
              placement: {
                type: "string",
                enum: ["whole", "left", "right"],
                description:
                  "REQUIRED. Which part of the pizza this topping goes on. 'whole' for an ordinary pizza. " +
                  "On a half-and-half you must say 'left' or 'right' for EVERY topping — never leave it to be guessed.",
              },
              count: { type: "integer", minimum: 1, description: "2 = double that topping." },
            },
            // 🚨 placement is REQUIRED, not optional-with-a-default.
            // It used to default to "whole" below the model, where no prompt
            // could reach it. On 2026-08-14 that put a caller's toppings across
            // a side he had explicitly rejected and billed them at the whole-
            // pizza rate (double the half rate). Same lesson as the Roya call
            // the day before: a required field beats a paragraph of prompt.
            required: ["name", "placement"],
          },
        },
        quantity: { type: "integer", minimum: 1, description: "How many of this exact pizza." },
        notes: { type: "string", description: "Kitchen note for this pizza." },
      },
      required: ["menuItemId"],
    },
  },
  {
    name: "add_combo",
    description:
      "Add a combo to the order, with the caller's pick for each slot. A pizza pick carries its own size and toppings, exactly like add_pizza. Anything unclear comes back in `unresolved` — ask, then call again.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        menuItemId: { type: "string", description: "The combo's menuItemId." },
        picks: {
          type: "array",
          description: "One entry per slot choice, in the order the slots were offered.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              menuItemId: { type: "string", description: "The chosen item's menuItemId." },
              size: { type: "string" },
              crust: { type: "string", description: "Only if the caller named one." },
              sauce: { type: "string", description: "Only if the caller named one." },
              cheese: { type: "string", description: "Only if the caller named one." },
              notes: { type: "string", description: "Kitchen note for this item." },
              toppings: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    name: { type: "string" },
                    placement: {
                      type: "string",
                      enum: ["whole", "left", "right"],
                      description: "REQUIRED. 'whole', or 'left'/'right' on a half-and-half.",
                    },
                    count: { type: "integer", minimum: 1 },
                  },
                  required: ["name", "placement"],
                },
              },
            },
            required: ["menuItemId"],
          },
        },
        quantity: { type: "integer", minimum: 1 },
        notes: { type: "string" },
      },
      required: ["menuItemId", "picks"],
    },
  },
  {
    name: "revise_line",
    description:
      "Change something already on the order — 'actually make that second pizza half mushroom instead of onion', 'make the first one large', 'add extra cheese to that'. Give the line number from the running order and ONLY what changes. The order is rebuilt from scratch, so the price stays correct.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        lineNumber: { type: "integer", minimum: 1, description: "Which line, as numbered in the running order." },
        swapToItemId: {
          type: "string",
          description:
            "Swap this line to a different menu item, keeping the same size and toppings. Used to accept a cheaper day deal offered in betterDeal.",
        },
        size: { type: "string", description: "New size." },
        crust: { type: "string" },
        sauce: { type: "string" },
        cheese: { type: "string" },
        quantity: { type: "integer", minimum: 1 },
        notes: { type: "string" },
        toppings: {
          type: "array",
          description:
            "The COMPLETE new topping list for this item. Use when the caller restates what they want on it.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              placement: {
                type: "string",
                enum: ["whole", "left", "right"],
                description: "REQUIRED. 'whole', or 'left'/'right' on a half-and-half.",
              },
              count: { type: "integer", minimum: 1 },
            },
            required: ["name", "placement"],
          },
        },
        addToppings: {
          type: "array",
          description: "Toppings to ADD, leaving the rest of the item alone.",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: { type: "string" },
              placement: {
                type: "string",
                enum: ["whole", "left", "right"],
                description: "REQUIRED. 'whole', or 'left'/'right' on a half-and-half.",
              },
              count: { type: "integer", minimum: 1 },
            },
            required: ["name", "placement"],
          },
        },
        removeToppings: {
          type: "array",
          description: "Topping names to TAKE OFF ('no onions after all').",
          items: { type: "string" },
        },
      },
      required: ["lineNumber"],
    },
  },
  {
    name: "remove_line",
    description:
      "Take something off the order entirely — 'actually, forget the wings'. Give the line number from the running order.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { lineNumber: { type: "integer", minimum: 1 } },
      required: ["lineNumber"],
    },
  },
  {
    name: "check_delivery_address",
    description:
      "FIRST STEP OF EVERY DELIVERY ORDER, before taking any food. Checks a delivery address against the restaurant's real delivery zones and returns whether they deliver there, the delivery fee, and any minimum order. Call this the moment you have the caller's street, city and postcode — never after building the order, because the fee and whether delivery is possible at all depend on the address.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        street: { type: "string", description: "House number and street, as the caller said it." },
        city: { type: "string" },
        zip: { type: "string", description: "Postcode, if the caller gave one." },
      },
      required: ["street"],
    },
  },
  {
    name: "quote_order",
    description:
      "Get the authoritative total for everything added so far, including tax, delivery and any discount. ALWAYS call this and read the total back before place_order when the order contains a pizza or combo — their prices cannot be added up from menu prices. For delivery you must have the address first.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["pickup", "delivery"] },
        items: { type: "array", items: ITEM_SCHEMA, description: "Simple (non-pizza) items, if any." },
        customerPhone: { type: "string", description: "The number the order will be placed under, if the caller gave one." },
        deliveryStreet: { type: "string", description: "Required for delivery — same address you'll place the order with." },
        deliveryCity: { type: "string" },
        deliveryZip: { type: "string" },
      },
      required: ["type"],
    },
  },
  {
    name: "transfer_to_human",
    description:
      "Hand the call to a member of staff. Use when you can't confidently complete what the caller wants, they explicitly ask for a person, or you've misunderstood twice in a row.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: { reason: { type: "string" } },
      required: ["reason"],
    },
  },
  {
    name: "send_sms_link",
    description: "Text the caller a link (their online-order page, menu, reservation, support, or an order receipt).",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        linkType: { type: "string", enum: ["order_online", "menu", "reservation", "support", "receipt"] },
      },
      required: ["linkType"],
    },
  },
];

/** The tools the model may call THIS call — capability toggles remove whole
 *  tools (a tool that isn't offered can't be hallucinated into use), and
 *  smsConfirmations=false removes texting entirely. transfer_to_human always
 *  survives so the call can never dead-end. */
export function toolsForConfig(cfg: AgentConfig) {
  const PIZZA_TOOLS = ["get_item_options", "add_pizza", "add_combo", "revise_line", "remove_line"];
  return TOOLS.filter((t) => {
    if (
      (t.name === "place_order" ||
        t.name === "price_order_preview" ||
        t.name === "quote_order" ||
        t.name === "check_delivery_address") &&
      !cfg.canTakeOrders
    )
      return false;
    if ((t.name === "book_reservation" || t.name === "check_reservation_availability") && !cfg.canBookReservations) return false;
    if (t.name === "send_sms_link" && !cfg.smsConfirmations) return false;
    // v2 build tools only exist for stores that opted in. A tool that isn't
    // offered can't be hallucinated into use, so a non-opted store behaves
    // exactly like v1 and transfers.
    if (PIZZA_TOOLS.includes(t.name) && !cfg.allowPizzaCombo) return false;
    return true;
  });
}

const digits = (s: string) => (s || "").replace(/\D/g, "");

/** The verified pin for an address, or null when we have none for THIS address.
 *  Guards against a stale pin riding along after the caller corrects their
 *  street — the same rule the web address book enforces (2026-08-01): a text
 *  change without fresh coordinates must clear the old ones, never reuse them. */
function deliveryPin(
  ctx: ToolContext,
  street?: string,
  city?: string,
  zip?: string,
): { lat: number; lng: number } | null {
  const pin = ctx.deliveryCoords;
  if (!pin) return null;
  return pin.forAddress === addressKey(street, city, zip) ? { lat: pin.lat, lng: pin.lng } : null;
}

/** Server-compiled lines + the model's simple items, ready to POST.
 *  `_readBack` is display-only bookkeeping and must not reach /api/orders. */
function mergeBasket(ctx: ToolContext, simpleItems: unknown): { items: any[]; dropped: string[] } {
  // Strip EVERY bookkeeping field. `_intent` in particular is the caller's whole
  // spoken request — useful for recompiling on revise_line, meaningless (and
  // large) on the wire.
  const built = ctx.basket.map(({ _readBack, _kind, _intent, ...line }) => line);
  const simple = Array.isArray(simpleItems) ? simpleItems : [];

  // 🚨 A PIZZA MAY NEVER ARRIVE AS A HAND-WRITTEN ITEM.
  //
  // Live on 2026-08-11, first real pizza order (ORD-342105315): the model added
  // the pizza with add_pizza AND restated it in `items`, so the caller was
  // charged for two. Worse, the restated copy had no modifiers at all, so
  // toppingBaseAdjust took its included-topping credit off a pizza with no
  // toppings to pay for it — $17.74 billed as $14.99. That is exactly the trap
  // this whole compiler exists to close, reopened through the one door left
  // open. So the door is shut here: anything the menu flags as PIZZA or COMBO
  // is dropped from `items`, as is anything already sitting in the basket.
  const inBasket = new Set(built.map((l: any) => String(l.menuItemId)));
  const dropped: string[] = [];
  const kept = simple.filter((it: any) => {
    const id = String(it?.menuItemId ?? "");
    if (!id) return false;
    if (inBasket.has(id)) {
      dropped.push(id);
      return false;
    }
    if (ctx.builderItemIds?.has(id)) {
      dropped.push(id);
      return false;
    }
    return true;
  });
  return { items: [...built, ...kept], dropped };
}

/** Ensure a two-token name (the /api/orders guard requires first + last). */
function twoTokenName(name: string): string {
  const n = (name || "").trim();
  return n.split(/\s+/).filter(Boolean).length >= 2 ? n : `${n || "Caller"} (phone)`;
}

/** Deterministic non-routable sentinel email so /api/orders' required-email
 *  guard passes; the domain is pre-seeded into EmailSuppression so it never
 *  actually sends/bounces. Confirmations go by SMS. */
function sentinelEmail(phone: string): string {
  return `voice.${canonicalPhone(phone) || "unknown"}@voice.nabil.invalid`;
}

/**
 * ONE canonical form for a caller's number — because the sentinel email above
 * IS the customer's identity, and identity decides which promotions apply.
 *
 * Live on 2026-08-11 (ORD-176217204): Nabil quoted "eighteen oh five — you
 * qualify for our first-time customer special", then charged twenty oh five.
 * Nothing was wrong with the promo engine. The caller ID arrives as
 * +16476690808 and the caller then read his number as "(647) 669-0808", so the
 * quote was priced as `voice.16476690808@…` (a customer that has never
 * existed → brand new → first-order discount) and the charge as
 * `voice.6476690808@…` (four previous orders → no discount). Same person, two
 * customers, two prices, and the caller agreed to the wrong one.
 *
 * North-American numbers reach us both ways, so the country code is dropped
 * when it is unambiguously there. Anything else is left alone.
 */
export function canonicalPhone(phone: string): string {
  const d = digits(phone);
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

export async function executeTool(name: string, input: any, ctx: ToolContext): Promise<unknown> {
  const slug = ctx.token.slug;
  switch (name) {
    case "price_order_preview": {
      // INTERIM (review wf_a62b0536, CRITICAL): the endpoint this was wired to
      // (/api/public/apply-promos) cannot return a priced total — it requires a
      // client-supplied subtotal and answers with promo discounts only — so the
      // raw 400 leaked into the model, which then summed menu prices itself
      // (no tax, no fees): the first live call's "prices were all wrong".
      // Until the internal dry-run priced preview ships, answer
      // deterministically so the model NEVER invents a total.
      return {
        unavailable: true,
        instruction:
          "No priced preview is available. Read back the items with their menu prices, say the total will include tax, and only state an exact total AFTER place_order returns it.",
      };
    }
    case "place_order": {
      const { phone, name: orderName } = orderIdentity(ctx, input);
      // Server-compiled pizza/combo lines ride alongside whatever simple items
      // the model listed. They were built by /api/internal/voice/build-line —
      // the model never assembled them, and never sees their internals.
      const merged = mergeBasket(ctx, input.items);
      const items = merged.items;
      if (!items.length) {
        return {
          error: true,
          code: "empty_order",
          message: "There's nothing in the order yet. Add what the caller asked for first.",
        };
      }
      // Duplicate guard (2026-08-10 live incident: two rapid "yes" prompts →
      // two orders 1.7s apart). Same basket already placed this call → return
      // the EXISTING order; never create a second one.
      const signature = basketSignature({ type: input.type, items });
      const prior = ctx.placedOrders.find((p) => p.signature === signature);
      if (prior) {
        return {
          ok: true,
          alreadyPlaced: true,
          orderId: prior.orderId,
          orderNumber: prior.orderNumber,
          total: prior.total,
          instruction:
            "This exact order was ALREADY placed earlier in this call — do NOT announce a new order. Reassure the caller it's confirmed and repeat the SAME order number and total.",
        };
      }
      // ── The owner's PHONE payment policy, honoured at last ───────────────
      // This used to be a hardcoded `paymentMethod: "cash"` with a comment
      // saying pay-by-link would "plug in here". Meanwhile the admin happily
      // saved pickupPaymentMode/deliveryPaymentMode and NOTHING read them, so a
      // store that switched phone orders to prepaid saw no change whatsoever —
      // the setting was decorative. Luigi 2026-08-12: phone and web must have
      // separate, real payment settings.
      //
      //   unpaid → pay at the store. Cash, exactly as today.
      //   both   → link with a pay-at-store fallback. The link doesn't exist
      //            yet, so the documented fallback applies immediately: cash.
      //            The caller still gets a working order, which is the whole
      //            point of "both".
      //   paid   → the owner requires prepayment. Pay-by-link is NOT built, so
      //            there is no honest way to take this order by phone. REFUSE.
      //            Quietly booking it as cash would hand an owner who asked for
      //            prepayment an unpaid order — the exact failure this setting
      //            exists to prevent, and worse than not taking the call.
      const paymentMode =
        input.type === "delivery" ? ctx.cfg.deliveryPaymentMode : ctx.cfg.pickupPaymentMode;
      if (paymentMode === "paid") {
        return {
          ok: false,
          refused: "prepayment_required",
          instruction:
            `This restaurant requires ${input.type} orders to be paid in advance, and paying by phone isn't available yet. ` +
            `Do NOT place the order and do NOT promise it. Apologise briefly, and offer to text the caller a link so they can order and pay online (send_sms_link), or to pass them to a member of staff.`,
        };
      }
      const payload: Record<string, unknown> = {
        restaurantSlug: slug,
        type: input.type,
        items,
        // Resolved, not read straight off the tool input: customerName is now
        // optional, and a returning caller's stored name is better than
        // whatever speech-to-text made of them saying it ("Roya Safi" came back
        // as "Royanne Veal" and went onto the kitchen ticket).
        customerName: twoTokenName(orderName),
        customerPhone: phone,
        customerEmail: sentinelEmail(phone),
        // Only "unpaid" and "both" reach here (gate above), and both settle at
        // the store — so cash is right for each. When pay-by-link ships, "both"
        // changes here and "paid" stops refusing.
        paymentMethod: "cash",
        channel: "voice",
        marketingConsent: false,
        // Basket-stable: the SAME items in the SAME call always produce the
        // SAME key, so /api/orders returns the already-created order instead
        // of minting a duplicate (its dedupe path is shaped like the 201).
        // A genuinely different second order gets a different signature.
        idempotencyKey: `voice-${ctx.token.callSid}-${fnv1a(signature)}`,
        notes: input.notes,
      };
      if (input.type === "delivery") {
        payload.deliveryAddress = input.deliveryStreet;
        payload.deliveryCity = input.deliveryCity;
        payload.deliveryZip = input.deliveryZip;
        // Forward the coordinates check_delivery_address already resolved, but
        // ONLY when they belong to this exact address. /api/orders treats these
        // as the customer's own pin and skips its own geocode, so the ORDER
        // lands in the same zone the caller was quoted. Without them a voice
        // delivery falls into the "unverified" third state and is billed the
        // restaurant's flat deliveryFee instead of the zone's — which is where
        // every voice delivery has been landing.
        const verified = deliveryPin(ctx, input.deliveryStreet, input.deliveryCity, input.deliveryZip);
        if (verified) {
          payload.deliveryLat = verified.lat;
          payload.deliveryLng = verified.lng;
        }
      }
      // The number the caller actually said yes to. The server refuses to
      // create the order at anything else (409 total_changed, before any write),
      // so "preview == charge" stops being a convention the two sides agree to
      // observe and becomes something neither side can break.
      //
      // Sent ONLY when the quote describes THIS basket: a caller who adds a Coke
      // after the read-back has legitimately changed their total, and refusing
      // that would be worse than the bug we're fixing.
      const quoteStillApplies =
        typeof ctx.lastQuotedTotal === "number" && ctx.lastQuoteSignature === signature;
      if (quoteStillApplies) payload.expectedTotal = ctx.lastQuotedTotal;

      let res: { ok: boolean; status: number; json: any };
      try {
        res = await api.placeOrder(payload);
      } catch (e) {
        // Timed out or the connection died. We do NOT know whether the order was
        // created — aborting our side does not un-create it — so the one thing
        // we must not do is retry, and the one thing we must not say is that it
        // failed. Hand the caller to a person who can look.
        console.error("[nabil-voice] placeOrder failed", e);
        return {
          error: true,
          code: "place_order_unknown",
          instruction:
            "The order MAY or MAY NOT have gone through — do not say either way, and do NOT call place_order again. " +
            "Tell the caller you're checking and connect them to a member of staff (transfer_to_human).",
        };
      }
      if (!res.ok) {
        // The server re-priced to something the caller never agreed to and
        // created NOTHING. Take the caller back to a yes/no on the real number
        // instead of apologising for a ticket that is already in the kitchen.
        if (res.status === 409 && res.json?.code === "total_changed") {
          const wasQuoted = ctx.lastQuotedTotal;
          const newTotal = Number(res.json?.total ?? 0);
          const nowNames: string[] = Array.isArray(res.json?.appliedPromoNames)
            ? res.json.appliedPromoNames.filter((n: unknown) => typeof n === "string" && n)
            : [];
          const reason = describeTotalChange(ctx.lastQuotedDiscountNames ?? [], nowNames);
          // The quote is dead either way — never let a stale number ride into a
          // second attempt.
          ctx.lastQuotedTotal = undefined;
          ctx.lastQuoteSignature = undefined;
          ctx.lastQuotedDiscountNames = undefined;
          return {
            error: true,
            code: "total_changed",
            notPlaced: true,
            quotedTotal: wasQuoted,
            total: newTotal,
            instruction:
              `THE ORDER WAS NOT PLACED. The real total is ${newTotal}, not the ${wasQuoted} you quoted${reason}. ` +
              `Apologise briefly, tell the caller the correct total plainly, and ask whether they still want it. ` +
              `Only call place_order again after they say yes. Do NOT claim the order is in.`,
          };
        }
        // Voice can't schedule ahead yet — the web error's "you can still
        // schedule" suffix would be a promise this channel can't keep. Offer
        // the SMS ordering link instead (review wf_a62b0536) — gated ONLY on
        // texting: the link opens the WEBSITE, which stays schedulable through
        // a pause, so allowScheduledOrders (a phone-line flag) must not gate it.
        if (res.json?.code === "service_paused") {
          return {
            error: true, code: "service_paused",
            message:
              ctx.cfg.smsConfirmations
                ? "The kitchen has ordering paused right now, and phone orders can't be scheduled ahead yet. Offer to text the caller the online ordering link (send_sms_link) so they can schedule it for after the pause themselves."
                : "The kitchen has ordering paused right now, and phone orders can't be scheduled ahead yet. Apologize and invite the caller to try again after the pause.",
          };
        }
        return { error: true, code: res.json?.code, message: res.json?.error || "Could not place the order." };
      }
      const orderId = res.json?.id != null ? String(res.json.id) : null;
      const orderNumber = res.json?.orderNumber;
      const total = res.json?.total;
      if (orderNumber) ctx.placedOrders.push({ signature, orderId, orderNumber: String(orderNumber), total: Number(total ?? 0) });
      // 🚨 EMPTY THE BASKET. It used to survive the placement, so a caller who
      // said "oh — and a Coke" after confirming got a SECOND order containing
      // the first order's food again (new signature ⇒ the dup-guard couldn't
      // help). The placed lines are done; anything after this is a new order.
      ctx.basket.length = 0;
      // Auto-applied promo (e.g. a first-time-customer special): tell the
      // caller WHY the total is lower than the read-back price — a silently
      // different number sounds like a mistake (live call, 2026-08-10).
      const promoDiscount = Number(res.json?.promoDiscount ?? 0);
      const promoNames: string[] = Array.isArray(res.json?.appliedPromoNames)
        ? res.json.appliedPromoNames.filter((n: unknown) => typeof n === "string" && n)
        : [];

      // The caller said yes to a NUMBER. If the charge came back different,
      // that is the one thing they must hear about — 2026-08-11, ORD-176217204
      // was quoted eighteen oh five and charged twenty oh five because the
      // quote and the charge resolved to different customers.
      //
      // With the server-side expectedTotal gate above this should now be
      // unreachable for a quoted basket; it stays as the backstop for a total
      // that moved for a reason the gate deliberately allows (the caller added
      // something after the quote) and for any older server that ignores the
      // field. Computed BEFORE the receipt goes out — texting a receipt for a
      // price the caller hasn't been told about is how they find out at the
      // counter.
      const quoted = quoteStillApplies ? ctx.lastQuotedTotal : undefined;
      const totalMoved =
        typeof quoted === "number" && typeof total === "number" && Math.abs(total - quoted) > 0.005;
      const changeReason = totalMoved
        ? describeTotalChange(ctx.lastQuotedDiscountNames ?? [], promoNames)
        : "";
      ctx.lastQuotedTotal = undefined;
      ctx.lastQuoteSignature = undefined;
      ctx.lastQuotedDiscountNames = undefined;

      // TEXT the receipt, don't dictate it (Luigi 2026-08-11: "it shouldn't
      // tell order number by phone, it should text it with the receipt"). An
      // order number read aloud is the single easiest thing in the call to
      // mishear, and the caller is usually nowhere near a pen. Sent from HERE
      // rather than left to the model: a confirmation the agent can forget is
      // a confirmation the customer doesn't get.
      //
      // Raced against a deadline: this is a cross-region round trip sitting
      // inside a tool hop that emits no audio, so a slow Resend/Twilio leg is
      // silence on a live phone line. On timeout we report NOT texted, which
      // makes the agent read the order number aloud — the honest fallback.
      let receiptTexted = false;
      if (ctx.cfg.smsConfirmations && phone && orderNumber) {
        try {
          const sms = await withDeadline(
            api.sendSms({
              restaurantId: ctx.token.restaurantId,
              slug,
              to: phone,
              linkType: "receipt",
              orderId,
              orderNumber: String(orderNumber),
              total: Number(total ?? 0),
            }),
            SMS_DEADLINE_MS,
          );
          receiptTexted = !!sms?.ok;
        } catch {
          receiptTexted = false; // fall back to speaking it — see below
        }
      }

      return {
        ok: true, orderId, orderNumber, total, receiptTexted,
        ...(totalMoved ? { quotedTotal: quoted, totalChanged: true } : {}),
        ...(promoDiscount > 0 ? { discountApplied: promoDiscount, discountNames: promoNames } : {}),
        instruction:
          (receiptTexted
            ? "Their receipt has ALREADY been texted to them with the order number and a tracking link — say so, and do NOT read the order number out loud. "
            : // No text went out (texting off, no caller ID, or it failed) —
              // then the spoken number is all they have, so give it clearly.
              "Read the caller their order number clearly — no receipt text could be sent, so it's the only record they'll have. ") +
          (totalMoved
            ? `⚠️ THE TOTAL CHANGED since you quoted ${quoted}${changeReason}. Tell the caller plainly what it is now. Never let them hang up believing the old number. `
            : "") +
          "Read this exact total — it is the authoritative charged amount including tax." +
          (promoDiscount > 0
            ? " A discount was applied automatically — briefly mention it as good news (name it if a name is given) so the total doesn't sound like an error."
            : ""),
      };
    }
    case "get_item_options": {
      const res = await api.itemOptions(slug, String(input.menuItemId ?? ""));
      // Trim to what's speakable — for MODIFIER groups the agent needs names and
      // prices, not ids it will never type (the compiler resolves toppings,
      // crusts and sauces by name).
      //
      // 🚨 COMBO SLOT CHOICES ARE THE EXCEPTION, and getting this wrong cost a
      // caller a whole minute on 2026-08-13. `add_combo` REQUIRES
      // `picks[].menuItemId`, but this trim used to hand back bare names — so
      // the model had to hunt the main menu for something called "Wings" and
      // found the CATERING wings (50/100/200 pc) instead of the combo's regular
      // 20 pc. The slot rejected the id, the model retried three times, and it
      // narrated every attempt out loud ("this is the catering wings item…").
      // Never withhold an id the tool schema demands.
      const item = res?.item;
      if (!item) return { error: true, message: "I couldn't find that item." };
      const groups = (item.modifierGroups ?? []).map((g: any) => ({
        name: g.name,
        role: g.pizzaRole ?? null,
        required: g.required,
        choices: (g.options ?? []).map((o: any) => o.name),
      }));
      return {
        name: item.name,
        sizes: (item.variants ?? []).map((v: any) => ({ name: v.name, price: v.price })),
        groups,
        isPizza: !!item.pizzaConfig,
        includedToppings: item.pizzaConfig?.includedToppings ?? null,
        extraToppingPrice: item.pizzaConfig?.extraToppingPrice ?? null,
        allowHalfHalf: item.pizzaConfig?.allowHalfHalf ?? null,
        combo: res?.combo
          ? {
              // A SHARED topping pool: this many toppings are covered by the
              // combo price and shared across EVERY pizza in it, replacing each
              // pizza's own allowance. So "6 shared" means any split the caller
              // likes — 1 and 5, 4 and 2, all 6 on one. Without this the model
              // reads each pizza's own includedToppings, invents a "3 each"
              // rule, and argues with a caller who asks for 1 and 5 (which is
              // exactly what happened on 2026-08-12, before it tried anyway and
              // found out it was free).
              sharedToppings: res.combo.sharedToppings ?? null,
              slots: res.combo.slots.map((s: any) => ({
                label: s.label,
                choose: s.min === s.max ? s.min : `${s.min}-${s.max}`,
                choices: s.choices.map((c: any) => ({
                  name: c.name,
                  // REQUIRED by add_combo — see the note above.
                  menuItemId: c.menuItemId,
                  // Only present when the slot restricts which sizes are
                  // orderable inside the combo; offering one outside the set
                  // 400s the build route.
                  ...(Array.isArray(c.variants) && c.variants.length
                    ? { sizes: c.variants.map((v: any) => v.name) }
                    : {}),
                })),
              })),
            }
          : null,
        instruction:
          "Offer these in natural speech — a couple of options at a time, never a long list. Prices are for reading aloud; the order total always comes from quote_order. " +
          "For a combo, pass each slot pick's menuItemId to add_combo EXACTLY as given here — never an id you found elsewhere in the menu, even if the name matches. " +
          "If sharedToppings is a number, the combo's pizzas SHARE that many toppings between them: any split the caller wants is fine and costs nothing extra. Say so plainly if they ask.",
      };
    }

    case "add_pizza":
    case "add_combo": {
      const kind = name === "add_pizza" ? "pizza" : "combo";
      const res = await api.buildLine({
        slug,
        kind,
        intent: input,
        askGroupIds: ctx.cfg.pizzaAskGroups,
        offerDeals: ctx.cfg.offerDayDeals,
      });
      if (!res.ok) {
        return { error: true, code: res.json?.code, message: res.json?.error || "I couldn't add that." };
      }
      const { line, readBack, pricingNote, unresolved, betterDeal, halves, switchedTo } = res.json ?? {};
      // The compiler refuses to guess. Unresolved questions come back verbatim
      // so the agent asks the caller rather than inventing an option id.
      if (!line || (Array.isArray(unresolved) && unresolved.length)) {
        return {
          needsInfo: true,
          questions: unresolved ?? [],
          instruction:
            "Ask the caller about these — one at a time, conversationally — then call this tool again with their answers. Do NOT place the order yet.",
        };
      }
      // Keep the INTENT with the compiled line so revise_line can merge a
      // change into it and recompile — never patch the compiled payload.
      ctx.basket.push({ ...line, _readBack: readBack, _kind: kind, _intent: { ...input }, _halves: halves ?? null });
      return {
        ok: true,
        added: readBack,
        // 🚨 SAY THIS, DON'T SUMMARISE IT.
        //
        // `readBack` is built from the COMPILED line — the same strings the
        // kitchen prints, including the item's real name. The instruction used
        // to invite a one-sentence summary, and on 2026-08-14 the model summed
        // "Large 1 Topping" up as "extra large" and regrouped a half-and-half
        // onto the wrong sides. The caller heard a pizza that did not exist and
        // had nothing to object to. A model reading "Large 1 Topping" aloud is
        // a model the caller corrects.
        speakExactly: readBack,
        ...(halves ? { halves } : {}),
        // The server built a DIFFERENT menu item to give the caller the size
        // they actually asked for — on this menu each size is often its own
        // product. Never a silent substitution (Luigi 2026-08-14: "cheapest,
        // but tell them"), so it is surfaced and the instruction below says it.
        ...(switchedTo ? { switchedTo } : {}),
        pricingNote: pricingNote ?? null,
        order: basketView(ctx),
        // A cheaper same-day deal covering EXACTLY this order. The saving was
        // computed server-side with the pricing engine that charges — never
        // recalculate it, and never claim one that isn't here.
        ...(betterDeal
          ? {
              betterDeal: {
                name: betterDeal.name,
                saves: betterDeal.saving,
                swapTo: betterDeal.menuItemId,
                lineNumber: ctx.basket.length,
              },
            }
          : {}),
        instruction:
          (pricingNote
            ? "Tell the caller the extra-topping charge in this pricingNote BEFORE moving on — they must never be surprised at pickup. "
            : "") +
          (betterDeal
            ? `TELL THEM ABOUT THE DEAL: today's "${betterDeal.name}" is the same thing for ${betterDeal.saving} less. Offer it in one friendly sentence and ask if they want it. If they say yes, call revise_line with lineNumber ${ctx.basket.length} and swapToItemId "${betterDeal.menuItemId}". If they say no, leave the order exactly as it is and move on. `
            : "") +
          (switchedTo
            ? `That size is a different item on this menu, so it was built as "${switchedTo.to}" instead of "${switchedTo.from}"` +
              (switchedTo.saving > 0
                ? `, which also comes to ${switchedTo.saving} LESS — say so as good news in the same breath. `
                : `. Mention the item you built in the read-back; do not present it as a problem. `)
            : "") +
          "Read `speakExactly` back WORD FOR WORD, including the item name exactly as written — do not restate the size, " +
          "the halves or the item in your own words, and do not shorten it. " +
          (halves
            ? "This pizza is SPLIT, so confirm it one half at a time: say what is on the first half and get a yes, then the second half and get a yes. " +
              "One question per turn. A single long question covering both halves gets a 'sure' from a tired caller and the wrong pizza gets made. "
            : "Then ask if they'd like anything else. ") +
          "The total comes from quote_order. " +
          "If they change their mind about something already on the order, use revise_line or remove_line with its line number from `order` — never add a corrected copy alongside the old one.",
      };
    }

    // ── mid-order editing ────────────────────────────────────────────────
    // Loman's headline is a live basket: "if a user changes an item mid-sentence
    // the AI updates the active order without resetting". Ours was append-only,
    // so "actually make that a large" produced TWO pizzas and a doubled total.
    // Both tools RECOMPILE from the stored intent — the compiled payload is
    // never hand-edited, because half/half prefixes, per-unit expansion and
    // preset seeding are all decided at compile time.
    case "revise_line": {
      const idx = Math.floor(Number(input.lineNumber)) - 1;
      const target = ctx.basket[idx];
      if (!target) {
        return {
          error: true,
          code: "no_such_line",
          order: basketView(ctx),
          message: "There's no such line on the order. Read them the order and ask which one they mean.",
        };
      }
      if (!target._intent || !target._kind) {
        return {
          error: true,
          code: "not_revisable",
          order: basketView(ctx),
          message: "That line can't be changed here — remove it with remove_line and add it again.",
        };
      }

      const prev = target._intent as any;
      let toppings: any[] = Array.isArray(prev.toppings) ? [...prev.toppings] : [];
      if (Array.isArray(input.toppings)) {
        toppings = input.toppings; // caller restated the whole list
      } else {
        if (Array.isArray(input.removeToppings)) {
          const drop = input.removeToppings.map((s: string) => String(s).toLowerCase().trim());
          toppings = toppings.filter((t) => !drop.includes(String(t?.name ?? "").toLowerCase().trim()));
        }
        if (Array.isArray(input.addToppings)) toppings = [...toppings, ...input.addToppings];
      }

      const merged: Record<string, unknown> = { ...prev };
      for (const k of ["size", "crust", "sauce", "cheese", "quantity", "notes"] as const) {
        if (input[k] !== undefined) merged[k] = input[k];
      }
      // Accepting a day deal: same order, different item. Recompiled like any
      // other change, so the swapped line is built and priced from scratch.
      if (typeof input.swapToItemId === "string" && input.swapToItemId.trim()) {
        merged.menuItemId = input.swapToItemId.trim();
      }
      if (target._kind === "pizza") merged.toppings = toppings;

      const res = await api.buildLine({
        slug,
        kind: target._kind,
        intent: merged,
        // No deal hunting on a REVISION — the caller has already chosen; being
        // sold a different item mid-correction is confusing, not helpful.
        askGroupIds: ctx.cfg.pizzaAskGroups,
      });
      if (!res.ok) {
        return { error: true, code: res.json?.code, message: res.json?.error || "I couldn't change that." };
      }
      const { line, readBack, pricingNote, unresolved, halves } = res.json ?? {};
      if (!line || (Array.isArray(unresolved) && unresolved.length)) {
        // The old line stays exactly as it was — a half-applied change is worse
        // than no change.
        return {
          needsInfo: true,
          questions: unresolved ?? [],
          order: basketView(ctx),
          instruction:
            "Ask the caller about these, then call revise_line again. The order is UNCHANGED until you do.",
        };
      }
      ctx.basket[idx] = { ...line, _readBack: readBack, _kind: target._kind, _intent: merged };
      return {
        ok: true,
        changed: readBack,
        pricingNote: pricingNote ?? null,
        order: basketView(ctx),
        instruction:
          (pricingNote ? "Tell the caller the extra-topping charge in this pricingNote. " : "") +
          "Confirm the CHANGE in one short sentence — don't re-read the whole order. Re-quote with quote_order before placing.",
      };
    }

    case "remove_line": {
      const idx = Math.floor(Number(input.lineNumber)) - 1;
      const target = ctx.basket[idx];
      if (!target) {
        return {
          error: true,
          code: "no_such_line",
          order: basketView(ctx),
          message: "There's no such line on the order. Read them the order and ask which one they mean.",
        };
      }
      ctx.basket.splice(idx, 1);
      return {
        ok: true,
        removed: target._readBack || "that item",
        order: basketView(ctx),
        instruction:
          ctx.basket.length
            ? "Confirm what you took off in one short sentence, then ask if that's everything. Re-quote before placing."
            : "The order is now empty. Ask what they'd like.",
      };
    }

    case "check_delivery_address": {
      const street = String(input.street ?? "").trim();
      if (!street) {
        return { error: true, code: "missing_street", message: "I need the street address first." };
      }
      const city = input.city ? String(input.city).trim() : undefined;
      const zip = input.zip ? String(input.zip).trim() : undefined;

      // A new address invalidates the old pin immediately — before the lookup,
      // so a failed check can never leave the previous address's coordinates
      // attached to a different street.
      ctx.deliveryCoords = null;

      const res = await api.checkAddress({ slug, street, city, zip });
      if (!res.ok) {
        // A geocoder outage must not dead-end a caller who is trying to give us
        // money. Fall through to the old behaviour: take the order, let the
        // store confirm the details.
        return {
          error: true,
          code: res.json?.code,
          message: "I couldn't check that address just now.",
          instruction:
            "Do NOT tell the caller anything about systems or maps, and do NOT refuse the order. Carry on taking it normally — the store will confirm the delivery details.",
        };
      }
      const j = res.json ?? {};
      if (j.located && typeof j.lat === "number" && typeof j.lng === "number") {
        ctx.deliveryCoords = { lat: j.lat, lng: j.lng, forAddress: addressKey(street, city, zip) };
      }
      // `instruction` (written by the endpoint) tells the model how to SAY it;
      // matchedAddress/zoneName/distanceKm are deliberately for the model only.
      return j;
    }

    case "quote_order": {
      const items = mergeBasket(ctx, input.items).items;
      if (!items.length) {
        return { error: true, code: "empty_order", message: "Nothing has been added yet." };
      }
      // Same customer as place_order will use — promo eligibility is keyed on
      // the customer, so quoting under the caller-ID number and charging under
      // the number they gave can move the total between the "yes" and the bill.
      const { phone, name: quoteName } = orderIdentity(ctx, input);
      // Refuse BEFORE quoting, not after. The dry run deliberately short-
      // circuits ahead of the placement guards, so without this the caller is
      // read a full itemised total, says yes, and only then discovers the order
      // can't be taken — the worst possible order in which to find out.
      const quoteMode =
        input.type === "delivery" ? ctx.cfg.deliveryPaymentMode : ctx.cfg.pickupPaymentMode;
      if (quoteMode === "paid") {
        return {
          error: true,
          code: "prepayment_required",
          message:
            `${input.type === "delivery" ? "Delivery" : "Pickup"} orders here must be paid in advance, and paying by phone isn't available yet. ` +
            `Don't quote a total or take the order. Offer to text an ordering link (send_sms_link), or to pass the caller to staff.`,
        };
      }
      const body: Record<string, unknown> = {
        restaurantSlug: slug,
        type: input.type,
        items,
        // The dry run re-validates exactly like a real placement, so it needs a
        // shape that passes the same guards — no order is created.
        customerName: twoTokenName(quoteName),
        customerPhone: phone,
        customerEmail: sentinelEmail(phone),
        // Matches what place_order will send (see the gate there) so the quote
        // is priced the same way the order is charged.
        paymentMethod: "cash",
        channel: "voice",
      };
      if (input.type === "delivery") {
        // Without these the route 400s on required delivery fields long before
        // the dryRun branch — every delivery quote failed — and even where it
        // passed, the fee would be the wrong zone's.
        if (!input.deliveryStreet) {
          return {
            error: true,
            code: "delivery_address_needed",
            message:
              "I need the delivery address before I can give a total — the delivery fee depends on it. Ask for the street address, city and postal code, then quote again.",
          };
        }
        body.deliveryAddress = input.deliveryStreet;
        body.deliveryCity = input.deliveryCity;
        body.deliveryZip = input.deliveryZip;
        // Same verified pin place_order will send. If the quote geocoded and
        // the charge didn't (or vice versa), the caller agrees to one delivery
        // fee and is billed another — the precise split that produced Ben
        // Bilton's $7.99.
        const verified = deliveryPin(ctx, input.deliveryStreet, input.deliveryCity, input.deliveryZip);
        if (verified) {
          body.deliveryLat = verified.lat;
          body.deliveryLng = verified.lng;
        }
      }
      const res = await api.dryRunOrder(body);
      if (!res.ok) {
        return {
          error: true,
          code: res.json?.code,
          message: res.json?.error || "I couldn't price that order.",
          instruction:
            "Something in the order isn't orderable. Tell the caller plainly what the problem is and fix it with them, or transfer.",
        };
      }
      const q = res.json ?? {};
      const quotedNames: string[] = Array.isArray(q.appliedPromoNames)
        ? q.appliedPromoNames.filter((n: unknown) => typeof n === "string" && n)
        : [];
      ctx.lastQuotedTotal = typeof q.total === "number" ? q.total : undefined;
      // WHAT this total was quoted for. place_order sends the total back as
      // `expectedTotal` only when the basket still matches, so a caller adding a
      // Coke after the read-back is allowed to change their total while a
      // silently re-priced basket is not. Signature over the MERGED items —
      // simple items never enter ctx.basket, they are merged in here.
      ctx.lastQuoteSignature = basketSignature({ type: input.type, items });
      ctx.lastQuotedDiscountNames = quotedNames;
      return {
        ok: true,
        total: q.total,
        subtotal: q.subtotal,
        tax: q.tax,
        discount: q.discount,
        discountNames: quotedNames,
        deliveryFee: q.deliveryFee,
        // Forwarded so the agent can itemise if the caller asks what the extra
        // charge is. The total already includes them; without these it could
        // only say "tax", and a refundable deposit is exactly the line a caller
        // expects to be told about.
        serviceFees: q.serviceFees,
        deposits: q.deposits,
        // So a re-quote after the caller corrects their number is visibly a
        // different customer, rather than an unexplained change of total.
        pricedAs: { phone, name: twoTokenName(quoteName) },
        order: basketView(ctx),
        instruction:
          "Read this EXACT total back to the caller — it is authoritative and includes tax. Do NOT mention any discount yet: this is a quote, and a discount here is not confirmed until the order is actually placed. Only call place_order after they say yes.",
      };
    }

    case "check_reservation_availability": {
      return api.availability(slug, input.date, input.partySize);
    }
    case "book_reservation": {
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
    case "transfer_to_human": {
      ctx.pendingTransfer = String(input.reason || "caller request");
      return { ok: true, message: "Connecting you to a team member now." };
    }
    case "send_sms_link": {
      // The "receipt" link is a LIVE order-tracking page (/status/<orderId>) —
      // but only if we send the order id. Without it the text fell back to the
      // generic ordering page, so the caller was promised tracking and got a
      // menu link. Use the most recent order placed on this call.
      const lastOrder = [...ctx.placedOrders].reverse().find((p) => p.orderId);
      const res = await api.sendSms({
        restaurantId: ctx.token.restaurantId,
        slug,
        to: ctx.customerPhone || ctx.token.from,
        linkType: input.linkType,
        orderId: lastOrder?.orderId ?? undefined,
      });
      return res.ok
        ? {
            ok: true,
            ...(input.linkType === "receipt" && lastOrder?.orderId
              ? { instruction: "Tell them the text lets them follow the order's progress, not just a receipt." }
              : {}),
          }
        : { error: true };
    }
    default:
      return { error: true, message: `Unknown tool ${name}` };
  }
}
