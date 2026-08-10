import { api } from "./api";
import type { CallToken } from "./config";

/**
 * Per-call context handed to every tool executor. The menu / hours / returning
 * caller are fetched once at setup and embedded in the system prompt (grounding
 * + lower latency), so the TOOLS here are the ACTIONS: preview, place order,
 * reservation availability + booking, transfer, SMS.
 */
export type ToolContext = {
  token: CallToken;
  cfg: any; // VoiceAgentConfig snapshot (payment modes, capabilities, etc.)
  cashDeliveryBlocked: boolean;
  /** Set by transfer_to_human — the session ends + hands off after the turn. */
  pendingTransfer: string | null;
  /** Orders already placed THIS call, keyed by basket signature — the guard
   *  against the model placing the same order twice (2026-08-10 live dup:
   *  "Yeah."+"Yes." arrived as two prompts → two place_order calls). */
  placedOrders: Array<{ signature: string; orderNumber: string; total: number }>;
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
    name: "transfer_to_human",
    description:
      "Hand the call to a member of staff. Use for pizza/combo builds, anything you can't confidently complete, an explicit request for a person, or repeated misunderstanding.",
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

const digits = (s: string) => (s || "").replace(/\D/g, "");

/** Canonical basket signature: same items+type in any order → same string.
 *  Order-level notes are deliberately EXCLUDED — a re-send of the same items
 *  with a slightly reworded note is the same order intent, not a new order. */
function basketSignature(input: any): string {
  const items = (Array.isArray(input.items) ? input.items : [])
    .map((it: any) => ({
      m: String(it.menuItemId ?? ""),
      v: String(it.variantId ?? ""),
      q: Number(it.quantity ?? 1),
      o: (Array.isArray(it.modifiers) ? it.modifiers : [])
        .map((mod: any) => String(mod?.modifierOptionId ?? ""))
        .sort(),
    }))
    .sort((a: any, b: any) => (a.m + a.v).localeCompare(b.m + b.v));
  return JSON.stringify({ t: String(input.type ?? ""), items });
}

/** FNV-1a 32-bit hex — stable, dependency-free hash for the idempotency key. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
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
      // Duplicate guard (2026-08-10 live incident: two rapid "yes" prompts →
      // two orders 1.7s apart). Same basket already placed this call → return
      // the EXISTING order; never create a second one.
      const signature = basketSignature(input);
      const prior = ctx.placedOrders.find((p) => p.signature === signature);
      if (prior) {
        return {
          ok: true,
          alreadyPlaced: true,
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
        items: input.items,
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
        // the SMS ordering link instead (review wf_a62b0536).
        if (res.json?.code === "service_paused") {
          return {
            error: true, code: "service_paused",
            message:
              "The kitchen has ordering paused right now, and phone orders can't be scheduled ahead yet. Offer to text the caller the online ordering link (send_sms_link) so they can schedule it for after the pause themselves.",
          };
        }
        return { error: true, code: res.json?.code, message: res.json?.error || "Could not place the order." };
      }
      const orderNumber = res.json?.orderNumber;
      const total = res.json?.total;
      if (orderNumber) ctx.placedOrders.push({ signature, orderNumber: String(orderNumber), total: Number(total ?? 0) });
      return {
        ok: true, orderNumber, total,
        instruction: "Read the caller their order number and this exact total — it is the authoritative charged amount including tax.",
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
