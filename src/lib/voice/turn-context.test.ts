/**
 * The per-turn STATE block (`services/nabil-voice/src/turn-context.ts`): the
 * authoritative order + dialogue state rendered deterministically into the
 * user turn so the model reads the truth instead of remembering it.
 */
import { describe, expect, it } from "vitest";
import { renderStateBlock, buildUserTurnContent, callerTextOf, STATE_MAX_CHARS } from "../../../services/nabil-voice/src/turn-context";
import type { OrderState, LineSummary } from "../../../services/nabil-voice/src/cart-engine";
import { createDialogueState, type DialogueState } from "../../../services/nabil-voice/src/dialogue-state";

function line(id: string, description: string, over: Partial<LineSummary> = {}): LineSummary {
  return { lineId: id, kind: "item", quantity: 1, description, status: "complete", ...over };
}

function order(over: Partial<OrderState> = {}): OrderState {
  return {
    turn: 3,
    fulfilment: { type: "pickup" },
    customer: { name: "Marco", phone: "6476690808", phoneSource: "caller_id" },
    lines: [line("L1", "1× Coke"), line("L2", "1× Large 1 Topping — Pepperoni")],
    focusLineId: "L2",
    incomplete: [],
    problems: [],
    quote: null,
    placed: [],
    cartHash: "abc12345",
    ...over,
  };
}

const render = (o: Partial<OrderState> = {}, d: Partial<DialogueState> = {}, extra?: string[], mode?: "full" | "compact") =>
  renderStateBlock({ order: order(o), dialogue: { ...createDialogueState(), ...d }, extraNotes: extra, mode });

describe("renderStateBlock", () => {
  it("is deterministic and starts with the fixed header", () => {
    const a = render();
    const b = render();
    expect(a).toBe(b);
    const lines = a.split("\n");
    expect(lines[0]).toBe("[STATE t=3 | cart=abc12345 | pickup | name: Marco | phone: caller ID]");
    expect(lines[lines.length - 1]).toBe("[/STATE]");
    expect(a).toContain("L1 1× Coke [ok]");
    expect(a).toContain("L2 1× Large 1 Topping — Pepperoni [ok]");
    expect(a).toContain("focus: L2");
    expect(a).toContain("quote: none yet");
  });

  it("head reflects fulfilment, name and phone provenance", () => {
    expect(render({ fulfilment: { type: null }, customer: { name: null, phone: null, phoneSource: null } })).toContain("pickup/delivery: not settled | name: needed | phone: unknown");
    expect(render({ fulfilment: { type: "delivery" } })).toContain("delivery (address needed)");
    expect(render({ fulfilment: { type: "delivery", address: "17 Commercial St, Milton", verified: false } })).toContain("delivery: 17 Commercial St, Milton (unverified)");
    expect(render({ fulfilment: { type: "delivery", address: "17 Commercial St, Milton", verified: true, fee: 7.99 } })).toContain("delivery: 17 Commercial St, Milton (verified, fee 7.99)");
    expect(render({ customer: { name: "Roya", phone: "4168338405", phoneSource: "spoken" } })).toContain("phone: given");
    expect(render({ lines: [], focusLineId: null })).toContain("(order is empty)");
  });

  it("switches to compact mode above 6 lines: only focus / incomplete / recent lines stay detailed", () => {
    const many = Array.from({ length: 8 }, (_, i) => line(`L${i + 1}`, `1× Item ${i + 1} — extra words: more`));
    many[2] = line("L3", "1× Wings", { status: "needs_info", questions: ["Which size for Wings?"] });
    const text = render({ lines: many, focusLineId: "L8", incomplete: ["L3"] }, { recentLineIds: ["L8", "L5", "L1"] });
    // compact one-liners: description cut at " — " / ":"
    expect(text).toContain("L2 1× Item 2 [ok]");
    expect(text).toContain("L4 1× Item 4 [ok]");
    // detailed: focus, incomplete, first two recent
    expect(text).toContain("L8 1× Item 8 — extra words: more [ok]");
    expect(text).toContain("L5 1× Item 5 — extra words: more [ok]");
    expect(text).toContain("L3 1× Wings [needs: Which size for Wings?]");
    expect(text).toContain("L1 1× Item 1 [ok]"); // third recent is NOT detailed
    expect(text).toContain("recent: L8, L5, L1");
    // an explicit full mode renders everything in full regardless of count
    expect(render({ lines: many, focusLineId: "L8" }, {}, undefined, "full")).toContain("L2 1× Item 2 — extra words: more [ok]");
  });

  it("renders needs / pending / declined / unannounced / quote / blocking / placed lines in fixed order", () => {
    const text = render(
      {
        lines: [line("L1", "1× Wings", { status: "needs_info", questions: ["Which size?"] }), line("L2", "1× Coke")],
        incomplete: ["L1"],
        problems: [
          { code: "line_incomplete", lineId: "L1", message: "x", blocking: true },
          { code: "address_unverified", message: "y", blocking: false },
          { code: "customer_name_missing", message: "z", blocking: true },
        ],
        quote: { total: 24.5, stale: true },
        placed: [{ orderNumber: "ORD-1", total: 12 }],
      },
      {
        pending: { kind: "needs_info", lineId: "L1", question: "Which size?" },
        offered: [
          { what: "Tuesday Special", kind: "deal", outcome: "declined", turn: 1 },
          { what: "Garlic dip", kind: "upsell", outcome: "pending", turn: 2 },
        ],
        unannounced: ["L2"],
        placeFailed: { code: "total_changed", turn: 3 },
      },
      ["extra note here"],
    );
    const lines = text.split("\n");
    const idx = (s: string) => lines.findIndex((l) => l.startsWith(s));
    expect(lines).toContain("L1 1× Wings [needs: Which size?]");
    expect(lines).toContain("pending: L1 — Which size?");
    expect(lines).toContain("declined: Tuesday Special — do not offer again");
    expect(text).not.toContain("Garlic dip");
    expect(lines).toContain("unannounced: L2 changed but the caller has NOT been told yet — say it");
    expect(lines).toContain("quote: 24.5 (STALE — cart changed, quote again)");
    expect(lines).toContain("blocking: L1 line_incomplete, customer_name_missing"); // non-blocking omitted
    expect(lines).toContain("placed this call: ORD-1 (12)");
    expect(lines).toContain("ORDER NOT PLACED — the last place_order failed (total_changed). Never say it is confirmed.");
    expect(lines).toContain("extra note here");
    expect(idx("pending:")).toBeLessThan(idx("declined:"));
    expect(idx("declined:")).toBeLessThan(idx("unannounced:"));
    expect(idx("unannounced:")).toBeLessThan(idx("quote:"));
    expect(idx("quote:")).toBeLessThan(idx("blocking:"));
    expect(idx("blocking:")).toBeLessThan(idx("placed this call:"));
    expect(idx("placed this call:")).toBeLessThan(idx("ORDER NOT PLACED"));
    expect(idx("ORDER NOT PLACED")).toBeLessThan(idx("extra note here"));
    expect(lines[lines.length - 1]).toBe("[/STATE]");
  });

  it("renders the other pending kinds and a current quote", () => {
    expect(render({}, { pending: { kind: "which_line", candidates: ["L1", "L2"], about: "update_line" } })).toContain("pending: which line? candidates L1, L2 — ASK, do not guess");
    expect(render({}, { pending: { kind: "possible_duplicate", lineId: "L1" } })).toContain("pending: is it a change to L1 or an additional one? — ASK");
    expect(render({ quote: { total: 24.5, stale: false } }, { pending: { kind: "confirm_order", cartHash: "abc12345" } })).toContain("pending: caller's yes/no on the quoted total");
    expect(render({ quote: { total: 24.5, stale: false } })).toContain("quote: 24.5 (current)");
    expect(render({}, { pending: { kind: "confirm_order", cartHash: "OLDHASH" } })).toContain("pending: cart changed since the quote — quote again before placing");
  });

  it("caps the block: old complete one-liners collapse into a count with a pointer to get_order_state", () => {
    const desc = (i: number) => `1× Very Long Named Menu Item Number ${i} With Many Words So It Is Long`;
    const many = Array.from({ length: 40 }, (_, i) => line(`L${i + 1}`, desc(i + 1)));
    const text = render({ lines: many, focusLineId: "L40" }, { recentLineIds: ["L40", "L39"] });
    expect(text.length).toBeLessThanOrEqual(STATE_MAX_CHARS);
    expect(text).toMatch(/…and \d+ more complete lines \(call get_order_state to see them\)/);
    expect(text.split("\n")[0]).toMatch(/^\[STATE t=3/);
    expect(text).toContain("L40 " + desc(40)); // the focus line survives in full
    expect(text).not.toContain("L2 1× Very Long"); // an old one-liner was folded
    expect(text.trim().endsWith("[/STATE]")).toBe(true);
  });
});

describe("buildUserTurnContent", () => {
  it("is two text blocks — STATE first, the caller's words last — and one when there is no state", () => {
    const withState = buildUserTurnContent({ stateBlock: "[STATE t=1]\n[/STATE]", asides: [], text: "Pickup please." });
    expect(withState).toEqual([
      { type: "text", text: "[STATE t=1]\n[/STATE]" },
      { type: "text", text: "Pickup please." },
    ]);
    expect(buildUserTurnContent({ stateBlock: null, asides: [], text: "Hi" })).toEqual([{ type: "text", text: "Hi" }]);
  });

  it("prefixes what was already said aloud (asides) so the model does not repeat it", () => {
    const c = buildUserTurnContent({ stateBlock: "[STATE t=2]\n[/STATE]", asides: ["One sec.", "Let me check that."], text: "Yes." });
    expect(c).toHaveLength(2);
    expect(c[1].text).toBe(`(You already said out loud, just now: "One sec." "Let me check that." — do not repeat any of it.)\nYes.`);
  });
});

describe("callerTextOf", () => {
  it("returns plain strings as-is, the last text block of built content, and strips the asides prefix", () => {
    expect(callerTextOf("Two large pizzas.")).toBe("Two large pizzas.");
    const built = buildUserTurnContent({ stateBlock: "[STATE t=2]\n[/STATE]", asides: ["One sec."], text: "Yes." });
    expect(callerTextOf(built)).toBe("Yes.");
    expect(callerTextOf(buildUserTurnContent({ stateBlock: "[STATE t=2]\n[/STATE]", asides: [], text: "No onions." }))).toBe("No onions.");
    expect(callerTextOf([{ type: "tool_result", tool_use_id: "x", content: "{}" }])).toBe("");
    expect(callerTextOf(null)).toBe("");
    expect(callerTextOf(42)).toBe("");
  });
});
