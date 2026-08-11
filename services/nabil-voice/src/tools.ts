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
};

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
        items: { type: "array", items: ITEM_SCHEMA },
        customerName: { type: "string", description: "The caller's name." },
        customerPhone: { type: "string", description: "Callback number (usually the caller ID)." },
        deliveryStreet: { type: "string" },
        deliveryCity: { type: "string" },
        deliveryZip: { type: "string" },
        notes: { type: "string", description: "Order-level note (e.g. 'ring the buzzer')." },
      },
      required: ["type", "items", "customerName", "customerPhone"],
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
    name: "quote_order",
    description:
      "Get the authoritative total for everything added so far, including tax and any discount. ALWAYS call this and read the total back before place_order when the order contains a pizza or combo — their prices cannot be added up from menu prices.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["pickup", "delivery"] },
        items: { type: "array", items: ITEM_SCHEMA, description: "Simple (non-pizza) items, if any." },
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
  const PIZZA_TOOLS = ["get_item_options", "add_pizza", "add_combo"];
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
function mergeBasket(ctx: ToolContext, simpleItems: unknown): any[] {
  const built = ctx.basket.map(({ _readBack, ...line }) => line);
  const simple = Array.isArray(simpleItems) ? simpleItems : [];
  return [...built, ...simple];
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
  const d = digits(phone) || "unknown";
  return `voice.${d}@voice.nabil.invalid`;
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
      const phone = input.customerPhone || ctx.token.from;
      // Server-compiled pizza/combo lines ride alongside whatever simple items
      // the model listed. They were built by /api/internal/voice/build-line —
      // the model never assembled them, and never sees their internals.
      const items = mergeBasket(ctx, input.items);
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
      // Auto-applied promo (e.g. a first-time-customer special): tell the
      // caller WHY the total is lower than the read-back price — a silently
      // different number sounds like a mistake (live call, 2026-08-10).
      const promoDiscount = Number(res.json?.promoDiscount ?? 0);
      const promoNames: string[] = Array.isArray(res.json?.appliedPromoNames)
        ? res.json.appliedPromoNames.filter((n: unknown) => typeof n === "string" && n)
        : [];
      return {
        ok: true, orderId, orderNumber, total,
        ...(promoDiscount > 0 ? { discountApplied: promoDiscount, discountNames: promoNames } : {}),
        instruction:
          "Read the caller their order number and this exact total — it is the authoritative charged amount including tax." +
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
      });
      if (!res.ok) {
        return { error: true, code: res.json?.code, message: res.json?.error || "I couldn't add that." };
      }
      const { line, readBack, pricingNote, unresolved } = res.json ?? {};
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
      ctx.basket.push({ ...line, _readBack: readBack });
      return {
        ok: true,
        added: readBack,
        pricingNote: pricingNote ?? null,
        orderSoFar: ctx.basket.map((l) => l._readBack).filter(Boolean),
        instruction:
          (pricingNote
            ? "Tell the caller the extra-topping charge in this pricingNote BEFORE moving on — they must never be surprised at pickup. "
            : "") +
          "Confirm what you added in one short sentence, then ask if they'd like anything else. The total comes from quote_order.",
      };
    }

    case "quote_order": {
      const items = mergeBasket(ctx, input.items);
      if (!items.length) {
        return { error: true, code: "empty_order", message: "Nothing has been added yet." };
      }
      const phone = ctx.token.from;
      const res = await api.dryRunOrder({
        restaurantSlug: slug,
        type: input.type,
        items,
        // The dry run re-validates exactly like a real placement, so it needs a
        // shape that passes the same guards — no order is created.
        customerName: "Phone Caller",
        customerPhone: phone,
        customerEmail: sentinelEmail(phone),
        paymentMethod: "cash",
        channel: "voice",
      });
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
      return {
        ok: true,
        total: q.total,
        subtotal: q.subtotal,
        tax: q.tax,
        discount: q.discount,
        discountNames: q.appliedPromoNames ?? [],
        lines: ctx.basket.map((l) => l._readBack).filter(Boolean),
        instruction:
          "Read this EXACT total back to the caller — it is authoritative and includes tax. If a discount applied, mention it as good news by name. Only call place_order after they say yes.",
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
      const res = await api.sendSms({
        restaurantId: ctx.token.restaurantId,
        slug,
        to: ctx.token.from,
        linkType: input.linkType,
      });
      return res.ok ? { ok: true } : { error: true };
    }
    default:
      return { error: true, message: `Unknown tool ${name}` };
  }
}
