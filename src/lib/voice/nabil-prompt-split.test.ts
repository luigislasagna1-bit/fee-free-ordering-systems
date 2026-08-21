/**
 * The STABLE / VOLATILE system-prompt split (Luigi call review, 2026-08-20).
 *
 * The whole prompt used to be ONE cached block, so every open/close flip, ETA
 * tick or owner test call invalidated the ~40k-token prefix — seconds of cold
 * prefill on the next caller's greeting. The split puts everything that flips
 * during a service day into a `RIGHT NOW` tail AFTER the cache breakpoint.
 *
 * The one invariant that matters: two builds that differ ONLY in live state
 * must produce byte-identical `.stable`. Any regression here silently kills
 * the cache win without failing anything else.
 */
import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../../../services/nabil-voice/src/prompt";
import { normalizeAgentConfig } from "../../../services/nabil-voice/src/agent-config";

const OPEN_CONTEXT = {
  restaurant: { name: "Luigi's", timezone: "America/Toronto", hoursFormat: "12h", currency: "cad" },
  open: { isOpenNow: true, todayHours: "10:00 AM – 12:00 AM (next day)", holidayName: null },
  services: { pickup: { offered: true, pausedNow: false }, delivery: { offered: true, pausedNow: false } },
  delivery: {},
  pickup: { estimatedMinutes: 20 },
  faqs: [{ q: "Do you have parking?", a: "Yes, out front." }],
  upsells: [],
};

const CLOSED_CONTEXT = {
  ...OPEN_CONTEXT,
  open: {
    isOpenNow: false,
    status: { kind: "opens_at", opensAt: "10:00 AM" },
    todayHours: "10:00 AM – 12:00 AM (next day)",
    holidayName: null,
    nextOpenAt: "2026-08-16T14:00:00.000Z",
    nextOpenLocal: "this morning at 10:00 AM",
  },
};

const MENU = {
  restaurant: { currency: "cad" },
  menu: [
    {
      category: "Pizza",
      items: [
        {
          menuItemId: "mi_philly",
          name: "Philly Steak Pizza",
          price: 22,
          todayDeal: { name: "Wednesday Special", dealItemId: "mi_deal", price: 17.99, variants: [] },
        },
      ],
    },
  ],
};

function built(context: any, extra: Record<string, unknown> = {}) {
  const cfg = normalizeAgentConfig({ canTakeOrders: true, canAnswerFaq: true, quoteEta: true });
  return buildSystemPrompt({ menu: MENU, context, returningCaller: { found: false }, cfg, callerPhone: null, ...extra });
}

describe("stable/volatile split", () => {
  it("system is exactly stable + volatile, and the volatile tail declares it overrides", () => {
    const b = built(OPEN_CONTEXT);
    expect(b.system).toBe(`${b.stable}\n\n${b.volatile}`);
    expect(b.volatile).toContain("## RIGHT NOW");
    expect(b.volatile).toContain("OVERRIDES");
  });

  it("live state lives ONLY in the volatile tail: open-now, pauses, live ETAs, CLOSED overrides", () => {
    const b = built(CLOSED_CONTEXT);
    expect(b.volatile).toContain("Open now: no");
    expect(b.volatile).toContain("CLOSED RIGHT NOW");
    expect(b.volatile).toContain("this morning at 10:00 AM");
    expect(b.stable).not.toContain("Open now:");
    expect(b.stable).not.toContain("CLOSED RIGHT NOW");
    expect(b.stable).not.toMatch(/Estimated ready times/);
  });

  it("the menu — including ★ TODAY ONLY day deals — stays in the STABLE block, byte-identical either way", () => {
    const b = built(OPEN_CONTEXT);
    expect(b.stable).toContain("# MENU (live");
    expect(b.stable).toContain("★ TODAY ONLY");
    expect(b.stable).toContain("Philly Steak Pizza");
    expect(b.stable).toContain("RESTAURANT FAQ");
  });

  it("builds differing ONLY in live/per-call state produce byte-identical .stable", () => {
    const open = built(OPEN_CONTEXT);
    const closed = built(CLOSED_CONTEXT);
    const paused = built({
      ...OPEN_CONTEXT,
      services: { ...OPEN_CONTEXT.services, pickup: { offered: true, pausedNow: true } },
    });
    const pausedWithResume = built({
      ...OPEN_CONTEXT,
      services: {
        pickup: { offered: true, pausedNow: false },
        delivery: { offered: true, pausedNow: true, pausedUntil: "2026-08-21T00:00:00.000Z", resumesLocal: "this evening at 8:00 PM" },
      },
    });
    const allPaused = built({
      ...OPEN_CONTEXT,
      services: {
        pickup: { offered: true, pausedNow: true },
        delivery: { offered: true, pausedNow: true },
      },
    });
    const ownerMessage = built({ ...OPEN_CONTEXT, services: { ...OPEN_CONTEXT.services, delivery: { offered: true, pausedNow: true } }, pauseGreeting: "Private event tonight — back tomorrow at 11!" });
    const etaMoved = built({ ...OPEN_CONTEXT, pickup: { estimatedMinutes: 45 } });
    const testCall = built(OPEN_CONTEXT, { isTestOrder: true });
    const demoCall = built(OPEN_CONTEXT, { isDemo: true });

    for (const b of [closed, paused, pausedWithResume, allPaused, ownerMessage, etaMoved, testCall, demoCall]) {
      expect(b.stable).toBe(open.stable);
    }
    // …and the volatile tail is what actually changed.
    expect(closed.volatile).not.toBe(open.volatile);
    expect(paused.volatile).toContain("PAUSED");
    expect(etaMoved.volatile).toContain("45 minutes");
    expect(testCall.volatile).toContain("## TEST MODE");
    expect(demoCall.volatile).toContain("## DEMO MODE");
    expect(open.volatile).not.toContain("TEST MODE");
  });

  it("a config change IS allowed to move the stable block (that is a real re-cache)", () => {
    const cfgA = normalizeAgentConfig({ canTakeOrders: true });
    const cfgB = normalizeAgentConfig({ canTakeOrders: false });
    const a = buildSystemPrompt({ menu: MENU, context: OPEN_CONTEXT, returningCaller: { found: false }, cfg: cfgA, callerPhone: null });
    const b = buildSystemPrompt({ menu: MENU, context: OPEN_CONTEXT, returningCaller: { found: false }, cfg: cfgB, callerPhone: null });
    expect(a.stable).not.toBe(b.stable);
  });
});

/**
 * Temporary Closure (owner pause) prompt rendering — Luigi 2026-08-20: name
 * what's paused + when it's back, offer what still runs, announce in the FIRST
 * substantive reply, refuse paused-service orders. All volatile-only (locked
 * by the byte-identity test above).
 */
describe("temporary closure (owner pause) rendering", () => {
  const pausedDelivery = {
    ...OPEN_CONTEXT,
    services: {
      pickup: { offered: true, pausedNow: false },
      delivery: { offered: true, pausedNow: true, pausedUntil: "2026-08-21T00:00:00.000Z", resumesLocal: "this evening at 8:00 PM" },
    },
  };

  it("a paused service is named in Services available with its resume time", () => {
    const b = built(pausedDelivery);
    expect(b.volatile).toContain("delivery (PAUSED by the owner right now — back this evening at 8:00 PM — no ASAP delivery orders)");
    expect(b.volatile).toContain("pickup, delivery (PAUSED");
  });

  it("partial pause: skips pickup/delivery question, mandates first-reply announcement + SMS-link deflection", () => {
    const b = built(pausedDelivery);
    expect(b.volatile).toContain("## SERVICE PAUSED RIGHT NOW");
    expect(b.volatile).toContain("Do NOT ask");
    expect(b.volatile).toContain("Only pickup is active");
    expect(b.volatile).toContain("name the pause");
    expect(b.volatile).toContain("send_sms_link");
    expect(b.volatile).not.toContain("TEMPORARILY CLOSED FOR ORDERS");
    expect(b.volatile).not.toMatch(/offer ONLY pickup/);
    expect(b.volatile).not.toContain("FLOW step 1");
  });

  it("smsConfirmations off swaps the deflection for call-back-later", () => {
    const cfg = normalizeAgentConfig({ canTakeOrders: true, smsConfirmations: false });
    const b = buildSystemPrompt({ menu: MENU, context: pausedDelivery, returningCaller: { found: false }, cfg, callerPhone: null });
    expect(b.volatile).not.toContain("send_sms_link");
    expect(b.volatile).toContain("call back once it resumes");
  });

  it("all order channels paused → TEMPORARILY CLOSED, with reservations offered only when bookable", () => {
    const bothPaused = {
      ...OPEN_CONTEXT,
      services: {
        pickup: { offered: true, pausedNow: true, resumesLocal: "tomorrow (Friday) at 11:00 AM" },
        delivery: { offered: true, pausedNow: true, resumesLocal: "tomorrow (Friday) at 11:00 AM" },
        reservations: { offered: true, pausedNow: false },
      },
    };
    const withRes = built(bothPaused);
    expect(withRes.volatile).toContain("## TEMPORARILY CLOSED FOR ORDERS");
    expect(withRes.volatile).toContain("still book reservations");
    expect(withRes.volatile).toContain("tomorrow (Friday) at 11:00 AM");

    const resPausedToo = built({
      ...bothPaused,
      services: { ...bothPaused.services, reservations: { offered: true, pausedNow: true } },
    });
    expect(resPausedToo.volatile).toContain("## TEMPORARILY CLOSED FOR ORDERS");
    expect(resPausedToo.volatile).not.toContain("still book reservations");
  });

  it("one offered channel, paused → TEMPORARILY CLOSED (no alternative exists)", () => {
    const pickupOnly = {
      ...OPEN_CONTEXT,
      services: { pickup: { offered: true, pausedNow: true }, delivery: { offered: false, pausedNow: false } },
    };
    const b = built(pickupOnly);
    expect(b.volatile).toContain("## TEMPORARILY CLOSED FOR ORDERS");
  });

  it("the owner's closure message is relayed", () => {
    const b = built({ ...pausedDelivery, pauseGreeting: "Private event tonight — back tomorrow at 11!" });
    expect(b.volatile).toContain('Private event tonight — back tomorrow at 11!');
    expect(b.volatile).toContain("convey it naturally");
  });

  it("legacy payload without pausedUntil/resumesLocal still renders a plain paused note", () => {
    const b = built({
      ...OPEN_CONTEXT,
      services: { pickup: { offered: true, pausedNow: false }, delivery: { offered: true, pausedNow: true } },
    });
    expect(b.volatile).toContain("delivery (PAUSED by the owner right now — no ASAP delivery orders)");
  });

  it("takeOut / dineIn / catering are rendered in Services available", () => {
    const b = built({
      ...OPEN_CONTEXT,
      services: {
        ...OPEN_CONTEXT.services,
        takeOut: { offered: true, pausedNow: false },
        dineIn: { offered: true, pausedNow: false },
        catering: { offered: true, pausedNow: true },
      },
    });
    expect(b.volatile).toContain("take-out");
    expect(b.volatile).toContain("dine-in");
    expect(b.volatile).toContain("catering (PAUSED");
  });
});
