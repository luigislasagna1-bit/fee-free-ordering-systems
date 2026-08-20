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
    const etaMoved = built({ ...OPEN_CONTEXT, pickup: { estimatedMinutes: 45 } });
    const testCall = built(OPEN_CONTEXT, { isTestOrder: true });
    const demoCall = built(OPEN_CONTEXT, { isDemo: true });

    for (const b of [closed, paused, etaMoved, testCall, demoCall]) {
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
