/**
 * Structured DIALOGUE state — the non-transactional facts a competent
 * order-taker keeps in their head between sentences: what we're talking about,
 * what we're waiting on, what has been offered and turned down, and what the
 * caller has NOT been told yet.
 *
 * Kept OUTSIDE the model's context on purpose (directive §8/§9): the model reads
 * it in the STATE block every turn instead of having to remember it across a
 * long call. Everything here is derived from tool calls/results and loop
 * events, never from parsing the model's prose.
 */
export type PendingQuestion =
  | { kind: "needs_info"; lineId: string; question: string }
  | { kind: "which_line"; candidates: string[]; about: string }
  | { kind: "possible_duplicate"; lineId: string }
  | { kind: "confirm_order"; cartHash: string };

export type OfferedThing = {
  what: string;
  kind: "deal" | "upsell";
  lineId?: string;
  outcome: "pending" | "accepted" | "declined";
  turn: number;
};

export type DialogueState = {
  recentLineIds: string[];
  pending: PendingQuestion | null;
  pendingSince: number;
  offered: OfferedThing[];
  /** Lines mutated by a tool in a turn that never got to speak afterwards. */
  unannounced: string[];
  placeFailed: { code: string; turn: number } | null;
  /** The cart hash the last successful quote_order read back. */
  quotedForCartHash: string | null;
  spokenSinceLastMutation: boolean;
};

export function createDialogueState(): DialogueState {
  return {
    recentLineIds: [],
    pending: null,
    pendingSince: 0,
    offered: [],
    unannounced: [],
    placeFailed: null,
    quotedForCartHash: null,
    spokenSinceLastMutation: true,
  };
}

const MUTATING = new Set(["add_to_order", "update_line", "remove_line"]);

/** Update from one tool call + its result. Pure; mutates the given state. */
export function noteToolResult(d: DialogueState, turn: number, name: string, input: any, out: any, cartHash: string | null) {
  const lineId: string | undefined = typeof out?.lineId === "string" ? out.lineId : undefined;
  if (MUTATING.has(name)) {
    // A change that touched NOTHING (engine `changed:false`, 2026-08-16) leaves
    // the cart, the read-back and the quote exactly as they were — nothing is
    // unannounced and no quote went stale. Only the focus moves.
    if (out?.ok && out?.changed === false) {
      if (lineId) d.recentLineIds = [lineId, ...d.recentLineIds.filter((x) => x !== lineId)].slice(0, 3);
      return;
    }
    if (out?.ok && lineId) {
      d.recentLineIds = [lineId, ...d.recentLineIds.filter((x) => x !== lineId)].slice(0, 3);
      if (!d.unannounced.includes(lineId)) d.unannounced.push(lineId);
      d.spokenSinceLastMutation = false;
      // A completed line clears its own pending question.
      if (d.pending?.kind === "needs_info" && d.pending.lineId === lineId && out?.line?.status === "complete") d.pending = null;
      if (d.pending?.kind === "which_line" || d.pending?.kind === "possible_duplicate") d.pending = null;
      if (out?.line?.status === "needs_info" && Array.isArray(out?.line?.questions) && out.line.questions.length) {
        d.pending = { kind: "needs_info", lineId, question: String(out.line.questions[0]) };
        d.pendingSince = turn;
      }
      if (out?.betterDeal?.name) {
        d.offered.push({ what: String(out.betterDeal.name), kind: "deal", lineId, outcome: "pending", turn });
      }
      // The cart changed — any read-back/quote no longer describes it.
      d.quotedForCartHash = null;
      if (d.pending?.kind === "confirm_order") d.pending = null;
    } else if (out && out.ok === false) {
      if (out.code === "ambiguous_line" && Array.isArray(out.candidates)) {
        d.pending = { kind: "which_line", candidates: out.candidates.map((c: any) => String(c.lineId)), about: name };
        d.pendingSince = turn;
      } else if (out.code === "possible_duplicate" && lineId) {
        d.pending = { kind: "possible_duplicate", lineId };
        d.pendingSince = turn;
      } else if (out.needsInfo && lineId && Array.isArray(out.questions) && out.questions.length) {
        d.pending = { kind: "needs_info", lineId, question: String(out.questions[0]) };
        d.pendingSince = turn;
      }
    }
    // A revise that swaps to a deal item resolves the pending offer.
    if (name === "update_line" && input?.replaceWithItemId && out?.ok) {
      for (const o of d.offered) if (o.outcome === "pending" && o.kind === "deal") o.outcome = "accepted";
    }
    return;
  }
  if (name === "quote_order") {
    if (out?.ok) {
      d.quotedForCartHash = cartHash;
      d.pending = { kind: "confirm_order", cartHash: cartHash ?? "" };
      d.pendingSince = turn;
    }
    return;
  }
  if (name === "place_order") {
    if (out?.ok) {
      d.placeFailed = null;
      d.pending = null;
      d.unannounced = [];
      d.recentLineIds = [];
      d.quotedForCartHash = null;
    } else if (out && (out.ok === false || out.error) && !out.alreadyPlaced) {
      d.placeFailed = { code: String(out.code ?? "unknown"), turn };
      if (d.pending?.kind === "confirm_order") d.pending = null;
    }
  }
}

/** The model spoke after the last mutation — the caller has now heard it. */
export function noteSpoken(d: DialogueState) {
  d.unannounced = [];
  d.spokenSinceLastMutation = true;
}

/** Called at the top of every caller turn: pending offers not taken by now are declined. */
export function beginTurn(d: DialogueState, turn: number) {
  for (const o of d.offered) if (o.outcome === "pending" && o.turn < turn - 1) o.outcome = "declined";
}
