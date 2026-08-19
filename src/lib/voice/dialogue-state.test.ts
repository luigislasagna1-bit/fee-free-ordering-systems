/**
 * Structured dialogue state (`services/nabil-voice/src/dialogue-state.ts`):
 * what we are waiting on, what was offered and turned down, what the caller
 * has NOT been told yet — derived from tool calls/results only, never from the
 * model's prose.
 */
import { describe, expect, it } from "vitest";
import { createDialogueState, noteToolResult, noteSpoken, beginTurn } from "../../../services/nabil-voice/src/dialogue-state";

const okLine = (lineId: string, status: "complete" | "needs_info", questions: string[] = [], extra: Record<string, unknown> = {}) => ({
  ok: true,
  lineId,
  line: { lineId, status, ...(questions.length ? { questions } : {}) },
  ...extra,
});

describe("createDialogueState", () => {
  it("starts empty with nothing pending and nothing unannounced", () => {
    expect(createDialogueState()).toEqual({
      recentLineIds: [],
      pending: null,
      pendingSince: 0,
      offered: [],
      unannounced: [],
      placeFailed: null,
      quotedForCartHash: null,
      spokenSinceLastMutation: true,
    });
  });
});

describe("noteToolResult — mutations", () => {
  it("a needs_info add becomes the pending question; completing that line clears it", () => {
    const d = createDialogueState();
    noteToolResult(d, 1, "add_to_order", { menuItemId: "wings" }, okLine("L1", "needs_info", ["Which size for Wings?"]), "h1");
    expect(d.pending).toEqual({ kind: "needs_info", lineId: "L1", question: "Which size for Wings?" });
    expect(d.pendingSince).toBe(1);
    expect(d.recentLineIds).toEqual(["L1"]);
    expect(d.unannounced).toEqual(["L1"]);
    expect(d.spokenSinceLastMutation).toBe(false);
    noteToolResult(d, 2, "update_line", { lineId: "L1", size: "10 pc" }, okLine("L1", "complete"), "h2");
    expect(d.pending).toBeNull();
    expect(d.recentLineIds).toEqual(["L1"]);
    // completing a DIFFERENT line leaves the question standing
    const d2 = createDialogueState();
    noteToolResult(d2, 1, "add_to_order", {}, okLine("L1", "needs_info", ["Which size?"]), "h1");
    noteToolResult(d2, 2, "add_to_order", {}, okLine("L2", "complete"), "h2");
    expect(d2.pending).toEqual({ kind: "needs_info", lineId: "L1", question: "Which size?" });
  });

  it("an ambiguous target becomes a which_line question; a possible duplicate its own; a needsInfo failure asks", () => {
    const d = createDialogueState();
    noteToolResult(d, 3, "update_line", { hint: "the pizza" }, { ok: false, needsInfo: true, code: "ambiguous_line", candidates: [{ lineId: "L1", description: "a" }, { lineId: "L2", description: "b" }] }, "h");
    expect(d.pending).toEqual({ kind: "which_line", candidates: ["L1", "L2"], about: "update_line" });
    expect(d.pendingSince).toBe(3);
    noteToolResult(d, 4, "add_to_order", { menuItemId: "cb" }, { ok: false, needsInfo: true, code: "possible_duplicate", lineId: "L1" }, "h");
    expect(d.pending).toEqual({ kind: "possible_duplicate", lineId: "L1" });
    noteToolResult(d, 5, "update_line", { lineId: "L1", crust: "x" }, { ok: false, needsInfo: true, code: "needs_info", lineId: "L1", questions: ["Which crust?", "Which sauce?"] }, "h");
    expect(d.pending).toEqual({ kind: "needs_info", lineId: "L1", question: "Which crust?" });
    // a failed mutation is not "unannounced" — nothing changed
    expect(d.unannounced).toEqual([]);
    expect(d.recentLineIds).toEqual([]);
    // an ordinary error sets nothing pending
    const d2 = createDialogueState();
    noteToolResult(d2, 1, "add_to_order", {}, { ok: false, error: true, code: "unknown_item" }, "h");
    expect(d2.pending).toBeNull();
  });

  it("any successful mutation resolves a which_line / possible_duplicate question and retires the quote", () => {
    const d = createDialogueState();
    noteToolResult(d, 1, "quote_order", {}, { ok: true, total: 24.5 }, "h1");
    expect(d.pending).toEqual({ kind: "confirm_order", cartHash: "h1" });
    expect(d.quotedForCartHash).toBe("h1");
    noteToolResult(d, 2, "add_to_order", {}, { ok: false, code: "possible_duplicate", lineId: "L1" }, "h1");
    expect(d.pending?.kind).toBe("possible_duplicate");
    noteToolResult(d, 3, "add_to_order", { confirmAnother: true }, okLine("L2", "complete"), "h2");
    expect(d.pending).toBeNull();
    expect(d.quotedForCartHash).toBeNull();
    // and a quote's confirm_order is cleared by a later mutation too
    noteToolResult(d, 4, "quote_order", {}, { ok: true }, "h2");
    noteToolResult(d, 5, "remove_line", { lineId: "L2" }, okLine("L2", "complete"), "h3");
    expect(d.pending).toBeNull();
    expect(d.quotedForCartHash).toBeNull();
    // a failed quote changes nothing
    const d2 = createDialogueState();
    noteToolResult(d2, 1, "quote_order", {}, { error: true, code: "cart_invalid" }, "h1");
    expect(d2.pending).toBeNull();
    expect(d2.quotedForCartHash).toBeNull();
  });

  it("recentLineIds is most-recent-first and capped at 3", () => {
    const d = createDialogueState();
    for (const id of ["L1", "L2", "L3", "L4"]) noteToolResult(d, 1, "add_to_order", {}, okLine(id, "complete"), "h");
    expect(d.recentLineIds).toEqual(["L4", "L3", "L2"]);
    noteToolResult(d, 2, "update_line", { lineId: "L2" }, okLine("L2", "complete"), "h");
    expect(d.recentLineIds).toEqual(["L2", "L4", "L3"]);
    expect(d.unannounced).toEqual(["L1", "L2", "L3", "L4"]);
  });

  it("unannounced is set on every mutation and cleared once the model speaks", () => {
    const d = createDialogueState();
    noteToolResult(d, 1, "add_to_order", {}, okLine("L1", "complete"), "h");
    noteToolResult(d, 1, "update_line", {}, okLine("L1", "complete"), "h");
    expect(d.unannounced).toEqual(["L1"]);
    expect(d.spokenSinceLastMutation).toBe(false);
    noteSpoken(d);
    expect(d.unannounced).toEqual([]);
    expect(d.spokenSinceLastMutation).toBe(true);
    noteToolResult(d, 2, "remove_line", {}, okLine("L1", "complete"), "h");
    expect(d.unannounced).toEqual(["L1"]);
  });
});

describe("noteToolResult — quote / place", () => {
  it("a place failure is remembered (and the confirm question dropped) until a later successful placement clears it", () => {
    const d = createDialogueState();
    noteToolResult(d, 1, "add_to_order", {}, okLine("L1", "complete"), "h1");
    noteToolResult(d, 2, "quote_order", {}, { ok: true }, "h1");
    noteToolResult(d, 3, "place_order", {}, { ok: false, code: "total_changed", notPlaced: true }, "h1");
    expect(d.placeFailed).toEqual({ code: "total_changed", turn: 3 });
    expect(d.pending).toBeNull();
    expect(d.unannounced).toEqual(["L1"]); // still not told
    noteToolResult(d, 4, "place_order", {}, { ok: false }, "h1");
    expect(d.placeFailed).toEqual({ code: "unknown", turn: 4 });
    noteToolResult(d, 5, "quote_order", {}, { ok: true }, "h1");
    noteToolResult(d, 6, "place_order", {}, { ok: true, orderNumber: "ORD-1" }, "h1");
    expect(d.placeFailed).toBeNull();
    expect(d.pending).toBeNull();
    expect(d.unannounced).toEqual([]);
    expect(d.recentLineIds).toEqual([]);
    expect(d.quotedForCartHash).toBeNull();
  });

  it("an alreadyPlaced answer is not a failure", () => {
    const d = createDialogueState();
    noteToolResult(d, 1, "place_order", {}, { ok: true, alreadyPlaced: true, orderNumber: "ORD-1" }, "h");
    expect(d.placeFailed).toBeNull();
    // ok:false + alreadyPlaced would not be a failure either (defensive)
    noteToolResult(d, 2, "place_order", {}, { ok: false, alreadyPlaced: true }, "h");
    expect(d.placeFailed).toBeNull();
  });

  it("non-order tools leave the state alone", () => {
    const d = createDialogueState();
    noteToolResult(d, 1, "add_to_order", {}, okLine("L1", "needs_info", ["Which size?"]), "h");
    const before = JSON.stringify(d);
    noteToolResult(d, 2, "find_menu_item", { query: "coke" }, { ok: true, candidates: [] }, "h");
    noteToolResult(d, 2, "get_item_options", { menuItemId: "x" }, { name: "x" }, "h");
    noteToolResult(d, 2, "set_fulfilment", { type: "pickup" }, { ok: true }, "h2");
    noteToolResult(d, 2, "transfer_to_human", { reason: "r" }, { ok: true }, "h2");
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("offers", () => {
  it("auto-applied deals do NOT create an offered entry — no offer/accept/decline cycle", () => {
    const d = createDialogueState();
    noteToolResult(d, 1, "add_to_order", { menuItemId: "pz_large" }, okLine("L1", "complete", [], { autoAppliedDeal: { standardItemName: "Large 1 Topping", dealName: "Tuesday Special", dealMenuItemId: "pz_tuesday", saving: 5.75 } }), "h");
    expect(d.offered).toEqual([]);
  });
});
