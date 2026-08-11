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
   *  the same customer (promo eligibility is per-customer). */
  customerPhone?: string;
  customerName?: string;
  /** The last total quote_order spoke aloud. If place_order comes back with a
   *  different number, the caller agreed to a price we are not charging — say
   *  so out loud rather than quietly billing something else. */
  lastQuotedTotal?: number;
  /** menuItemIds the menu flags as PIZZA or COMBO. The model may never send
   *  these as hand-written `items` — they only ever reach an order through the
   *  compiler (add_pizza / add_combo). See mergeBasket. */
  builderItemIds?: Set<string>;
};

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
 *  between the "yes" and the receipt. */
function orderIdentity(ctx: ToolContext, input: any) {
  if (typeof input?.customerPhone === "string" && input.customerPhone.trim()) {
    ctx.customerPhone = input.customerPhone.trim();
  }
  if (typeof input?.customerName === "string" && input.customerName.trim()) {
    ctx.customerName = input.customerName.trim();
  }
  const phone = ctx.customerPhone || ctx.token.from;
  return { phone, name: ctx.customerName || "Phone Caller" };
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
        customerName: { type: "string", description: "The caller's name." },
        customerPhone: { type: "string", description: "Callback number (usually the caller ID)." },
        deliveryStreet: { type: "string" },
        deliveryCity: { type: "string" },
        deliveryZip: { type: "string" },
        notes: { type: "string", description: "Order-level note (e.g. 'ring the buzzer')." },
      },
      required: ["type", "customerName", "customerPhone"],
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
      "Look up the full choices for ONE menu item: sizes, crusts, sauces, toppings and their prices — or, for a combo, what goes in each slot. Call this when the caller asks what's available ('what crusts do you have?') or before building a pizza or combo you don't know the options for.",
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
                description: "Which half. Default whole.",
              },
              count: { type: "integer", minimum: 1, description: "2 = double that topping." },
            },
            required: ["name"],
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
                    placement: { type: "string", enum: ["whole", "left", "right"] },
                    count: { type: "integer", minimum: 1 },
                  },
                  required: ["name"],
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
              placement: { type: "string", enum: ["whole", "left", "right"] },
              count: { type: "integer", minimum: 1 },
            },
            required: ["name"],
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
              placement: { type: "string", enum: ["whole", "left", "right"] },
              count: { type: "integer", minimum: 1 },
            },
            required: ["name"],
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
    if ((t.name === "place_order" || t.name === "price_order_preview" || t.name === "quote_order") && !cfg.canTakeOrders) return false;
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
function canonicalPhone(phone: string): string {
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
      const { phone } = orderIdentity(ctx, input);
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
      // v1: pay-at-store (cash). Pay-by-link (task #17) plugs in here for
      // pickupPaymentMode/deliveryPaymentMode of "paid"/"both".
      const payload: Record<string, unknown> = {
        restaurantSlug: slug,
        type: input.type,
        items,
        customerName: twoTokenName(input.customerName),
        customerPhone: phone,
        customerEmail: sentinelEmail(phone),
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
      }
      const res = await api.placeOrder(payload);
      if (!res.ok) {
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

      // TEXT the receipt, don't dictate it (Luigi 2026-08-11: "it shouldn't
      // tell order number by phone, it should text it with the receipt"). An
      // order number read aloud is the single easiest thing in the call to
      // mishear, and the caller is usually nowhere near a pen. Sent from HERE
      // rather than left to the model: a confirmation the agent can forget is
      // a confirmation the customer doesn't get.
      let receiptTexted = false;
      if (ctx.cfg.smsConfirmations && phone && orderNumber) {
        try {
          const sms = await api.sendSms({
            restaurantId: ctx.token.restaurantId,
            slug,
            to: phone,
            linkType: "receipt",
            orderId,
            orderNumber: String(orderNumber),
            total: Number(total ?? 0),
          });
          receiptTexted = !!sms.ok;
        } catch {
          receiptTexted = false; // fall back to speaking it — see below
        }
      }

      // The caller said yes to a NUMBER. If the charge came back different,
      // that is the one thing they must hear about — 2026-08-11, ORD-176217204
      // was quoted eighteen oh five and charged twenty oh five because the
      // quote and the charge resolved to different customers.
      const quoted = ctx.lastQuotedTotal;
      const totalMoved =
        typeof quoted === "number" && typeof total === "number" && Math.abs(total - quoted) > 0.005;
      ctx.lastQuotedTotal = undefined;

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
            ? `⚠️ THE TOTAL CHANGED since you quoted ${quoted}. Tell the caller plainly what it is now and why if you know (a discount that did not apply). Never let them hang up believing the old number. `
            : "") +
          "Read this exact total — it is the authoritative charged amount including tax." +
          (promoDiscount > 0
            ? " A discount was applied automatically — briefly mention it as good news (name it if a name is given) so the total doesn't sound like an error."
            : ""),
      };
    }
    case "get_item_options": {
      const res = await api.itemOptions(slug, String(input.menuItemId ?? ""));
      // Trim to what's speakable — the agent needs names and prices, not ids
      // it will never type (the server resolves names for it).
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
              slots: res.combo.slots.map((s: any) => ({
                label: s.label,
                choose: s.min === s.max ? s.min : `${s.min}-${s.max}`,
                choices: s.choices.map((c: any) => c.name),
              })),
            }
          : null,
        instruction:
          "Offer these in natural speech — a couple of options at a time, never a long list. Prices are for reading aloud; the order total always comes from quote_order.",
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
      const { line, readBack, pricingNote, unresolved, betterDeal } = res.json ?? {};
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
      ctx.basket.push({ ...line, _readBack: readBack, _kind: kind, _intent: { ...input } });
      return {
        ok: true,
        added: readBack,
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
          "Confirm what you added in one short sentence, then ask if they'd like anything else. The total comes from quote_order. " +
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
      const { line, readBack, pricingNote, unresolved } = res.json ?? {};
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

    case "quote_order": {
      const items = mergeBasket(ctx, input.items).items;
      if (!items.length) {
        return { error: true, code: "empty_order", message: "Nothing has been added yet." };
      }
      // Same customer as place_order will use — promo eligibility is keyed on
      // the customer, so quoting under the caller-ID number and charging under
      // the number they gave can move the total between the "yes" and the bill.
      const { phone, name: quoteName } = orderIdentity(ctx, input);
      const body: Record<string, unknown> = {
        restaurantSlug: slug,
        type: input.type,
        items,
        // The dry run re-validates exactly like a real placement, so it needs a
        // shape that passes the same guards — no order is created.
        customerName: twoTokenName(quoteName),
        customerPhone: phone,
        customerEmail: sentinelEmail(phone),
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
      ctx.lastQuotedTotal = typeof q.total === "number" ? q.total : undefined;
      return {
        ok: true,
        total: q.total,
        subtotal: q.subtotal,
        tax: q.tax,
        discount: q.discount,
        discountNames: q.appliedPromoNames ?? [],
        deliveryFee: q.deliveryFee,
        order: basketView(ctx),
        instruction:
          "Read this EXACT total back to the caller — it is authoritative and includes tax. If a discount applied, mention it as good news by name. Only call place_order after they say yes, and place it with the SAME phone number and address you quoted with.",
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
