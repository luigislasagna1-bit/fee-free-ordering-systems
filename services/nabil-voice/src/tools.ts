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
  orderSeq: number;
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
      "Place the order into the kitchen. ONLY call after you have read the full order + total back and the caller said yes. The server re-prices and re-validates everything.",
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
      const res = await api.previewOrder({ restaurantSlug: slug, type: input.type, items: input.items });
      return res.json;
    }
    case "place_order": {
      const phone = input.customerPhone || ctx.token.from;
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
        idempotencyKey: `voice-${ctx.token.callSid}-${ctx.orderSeq++}`,
        notes: input.notes,
      };
      if (input.type === "delivery") {
        payload.deliveryAddress = input.deliveryStreet;
        payload.deliveryCity = input.deliveryCity;
        payload.deliveryZip = input.deliveryZip;
      }
      const res = await api.placeOrder(payload);
      if (!res.ok) return { error: true, code: res.json?.code, message: res.json?.error || "Could not place the order." };
      return { ok: true, orderNumber: res.json?.orderNumber, total: res.json?.total };
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
