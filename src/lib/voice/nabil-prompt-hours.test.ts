/**
 * The CLOSED / scheduling rules of the Nabil system prompt.
 *
 * Luigi's 2026-08-16 00:30 call: "Can I place an order for tomorrow?" →
 * "We can't schedule orders for a later time … we only take pre-orders for
 * right now" → (caller: "right now") → "we're actually closed, we reopen at
 * two o'clock this afternoon; I can take your order now as a pre-order".
 * Two defects: the reopening time was the UTC hour of an ISO string the model
 * was asked to convert itself (10 AM Toronto = 14:00Z), and the scheduling
 * rule contradicted the closed-hours rule. These tests pin both fixes.
 */
import { describe, expect, it } from "vitest";
import { buildSystemPrompt, nextOpenWords } from "../../../services/nabil-voice/src/prompt";
import { normalizeAgentConfig } from "../../../services/nabil-voice/src/agent-config";

const CLOSED_CONTEXT = {
  restaurant: { name: "Luigi's", timezone: "America/Toronto", hoursFormat: "12h", currency: "cad" },
  open: {
    isOpenNow: false,
    status: { kind: "opens_at", opensAt: "10:00 AM" },
    todayHours: "10:00 AM – 12:00 AM (next day)",
    holidayName: null,
    nextOpenAt: "2026-08-16T14:00:00.000Z", // 10:00 AM Toronto
    nextOpenLocal: "this morning at 10:00 AM",
  },
  services: { pickup: { offered: true, pausedNow: false }, delivery: { offered: true, pausedNow: false } },
  delivery: {},
  pickup: {},
  faqs: [],
  upsells: [],
};

const MENU = { restaurant: { currency: "cad" }, categories: [] };

function build(context: any, cfgOverrides: Record<string, unknown> = {}) {
  const cfg = normalizeAgentConfig({ canTakeOrders: true, canAnswerFaq: true, smsConfirmations: true, ...cfgOverrides });
  return buildSystemPrompt({ menu: MENU, context, returningCaller: null, cfg, callerPhone: null }).system;
}

describe("nextOpenWords", () => {
  it("prefers the server-computed local label", () => {
    expect(nextOpenWords(CLOSED_CONTEXT)).toBe("this morning at 10:00 AM");
  });
  it("falls back to formatting the ISO in the restaurant timezone (older payloads/snapshots) — never the UTC hour", () => {
    const words = nextOpenWords({ ...CLOSED_CONTEXT, open: { ...CLOSED_CONTEXT.open, nextOpenLocal: undefined } });
    expect(words).toMatch(/Sunday/);
    expect(words).toMatch(/10:00 AM/);
    expect(words).not.toMatch(/2:00|14:00/);
  });
  it("returns null with nothing to say", () => {
    expect(nextOpenWords({ open: { isOpenNow: false } })).toBeNull();
    expect(nextOpenWords({ open: { nextOpenAt: "not-a-date" }, restaurant: {} })).toBeNull();
  });
});

describe("closed-hours + scheduling rules", () => {
  it("while closed (take_orders): the prompt carries the LOCAL reopening words and no raw ISO / UTC hour", () => {
    const system = build(CLOSED_CONTEXT);
    expect(system).toContain("CLOSED RIGHT NOW");
    expect(system).toContain("this morning at 10:00 AM");
    expect(system).not.toContain("2026-08-16T14:00:00");
    expect(system).not.toMatch(/say that time in natural spoken words/);
  });

  it("while closed: 'tomorrow' / 'when you open' means take the order now — the prompt says so explicitly and never says RIGHT NOW only", () => {
    const system = build(CLOSED_CONTEXT);
    expect(system).toMatch(/A caller who asks for "tomorrow", "in the morning" or "when you open" wants exactly this — take the order/);
    expect(system).not.toMatch(/RIGHT NOW only/);
    expect(system).not.toMatch(/pre-orders for right now/i);
  });

  it("the scheduling rule is one coherent rule: no specific later time by phone, but an order taken now is prepared when the kitchen is next open", () => {
    const withSms = build(CLOSED_CONTEXT, { allowScheduledOrders: true, smsConfirmations: true });
    expect(withSms).toContain("a SPECIFIC later time or day can't be set by phone");
    expect(withSms).toContain("prepared as soon as the kitchen is next open");
    expect(withSms).toContain("send_sms_link order_online");

    const noSched = build(CLOSED_CONTEXT, { allowScheduledOrders: false, allowPizzaCombo: true });
    expect(noSched).toContain("a SPECIFIC later time or day can't be set by phone");
    expect(noSched).toContain("offer to take the order now instead");
    expect(noSched).not.toContain("send_sms_link order_online");
  });

  it("while open there is no CLOSED section and the scheduling rule still explains 'as soon as the kitchen is next open (right away while open)'", () => {
    const system = build({ ...CLOSED_CONTEXT, open: { ...CLOSED_CONTEXT.open, isOpenNow: true, status: { kind: "open", closesAt: "12:00 AM" }, nextOpenLocal: null } });
    expect(system).not.toContain("CLOSED RIGHT NOW");
    expect(system).toContain("right away while open");
  });
});
