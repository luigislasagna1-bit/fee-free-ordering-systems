/**
 * The per-turn STATE BLOCK — the authoritative order state, rendered compactly
 * and prepended to every caller turn so the model reads the truth instead of
 * remembering it (directive §3, §9).
 *
 * It rides on the USER message as its own text block. That keeps the cached
 * system+menu prefix byte-identical, keeps the caller's words separate from
 * our bookkeeping, and lets compaction drop old state blocks without touching
 * what the caller said.
 *
 * Deterministic, English, exact menu names, fixed section order — a layout the
 * model can learn once.
 */
import type { OrderState, LineSummary } from "./cart-engine";
import type { DialogueState } from "./dialogue-state";

export const STATE_MAX_CHARS = 2_800; // ≈700 tokens
const DETAILED_LINE_BUDGET = 6;

export type StateBlockInput = {
  order: OrderState;
  dialogue: DialogueState;
  mode?: "full" | "compact";
  /** Free-text notes the loop wants the model to see this turn (unannounced, not placed…). */
  extraNotes?: string[];
};

function lineText(l: LineSummary, detailed: boolean): string {
  const tag = l.status === "complete" ? "[ok]" : `[needs: ${l.questions?.[0] ?? "info"}]`;
  if (!detailed) return `${l.lineId} ${l.description.split(" — ")[0].split(":")[0]} ${tag}`;
  const bits: string[] = [l.description];
  if (l.picks?.length) bits.push(l.picks.map((p) => `${p.pickId}${p.slotLabel ? ` (${p.slotLabel})` : ""}: ${p.description}`).join("; "));
  return `${l.lineId} ${bits.join(" | ")} ${tag}`;
}

export function renderStateBlock(input: StateBlockInput): string {
  const { order: s, dialogue: d } = input;
  const mode = input.mode ?? (s.lines.length > DETAILED_LINE_BUDGET ? "compact" : "full");
  const head: string[] = [`t=${s.turn}`, `cart=${s.cartHash}`];
  if (s.fulfilment.type === "delivery") {
    head.push(
      `delivery${s.fulfilment.address ? `: ${s.fulfilment.address}` : " (address needed)"}${
        s.fulfilment.address ? (s.fulfilment.verified ? ` (verified${typeof s.fulfilment.fee === "number" ? `, fee ${s.fulfilment.fee}` : ""})` : " (unverified)") : ""
      }`,
    );
  } else if (s.fulfilment.type === "pickup") head.push("pickup");
  else head.push("pickup/delivery: not settled");
  head.push(s.customer.name ? `name: ${s.customer.name}` : "name: needed");
  head.push(s.customer.phone ? `phone: ${s.customer.phoneSource === "caller_id" ? "caller ID" : "given"}` : "phone: unknown");
  const out: string[] = [`[STATE ${head.join(" | ")}]`];

  if (!s.lines.length) out.push("(order is empty)");
  else {
    const detailedIds = new Set<string>();
    if (mode === "full") for (const l of s.lines) detailedIds.add(l.lineId);
    else {
      if (s.focusLineId) detailedIds.add(s.focusLineId);
      for (const id of s.incomplete) detailedIds.add(id);
      for (const id of d.recentLineIds.slice(0, 2)) detailedIds.add(id);
    }
    for (const l of s.lines) out.push(lineText(l, detailedIds.has(l.lineId)));
  }

  const meta: string[] = [];
  if (s.focusLineId) meta.push(`focus: ${s.focusLineId}`);
  if (d.recentLineIds.length) meta.push(`recent: ${d.recentLineIds.join(", ")}`);
  if (meta.length) out.push(meta.join(" | "));

  if (d.pending) {
    switch (d.pending.kind) {
      case "needs_info":
        out.push(`pending: ${d.pending.lineId} — ${d.pending.question}`);
        break;
      case "which_line":
        out.push(`pending: which line? candidates ${d.pending.candidates.join(", ")} — ASK, do not guess`);
        break;
      case "possible_duplicate":
        out.push(`pending: is it a change to ${d.pending.lineId} or an additional one? — ASK`);
        break;
      case "confirm_order":
        out.push(d.pending.cartHash === s.cartHash ? "pending: caller's yes/no on the quoted total" : "pending: cart changed since the quote — quote again before placing");
        break;
    }
  }
  const declined = d.offered.filter((o) => o.outcome === "declined").map((o) => o.what);
  if (declined.length) out.push(`declined: ${declined.join(", ")} — do not offer again`);
  if (d.unannounced.length) out.push(`unannounced: ${d.unannounced.join(", ")} changed but the caller has NOT been told yet — say it`);

  if (s.quote) out.push(`quote: ${s.quote.total}${s.quote.stale ? " (STALE — cart changed, quote again)" : " (current)"}`);
  else out.push("quote: none yet");
  const blocking = s.problems.filter((p) => p.blocking);
  if (blocking.length) out.push(`blocking: ${blocking.map((p) => (p.lineId ? `${p.lineId} ${p.code}` : p.code)).join(", ")}`);
  if (s.placed.length) out.push(`placed this call: ${s.placed.map((p) => `${p.orderNumber} (${p.total})`).join(", ")}`);
  if (d.placeFailed) out.push(`ORDER NOT PLACED — the last place_order failed (${d.placeFailed.code}). Never say it is confirmed.`);
  for (const n of input.extraNotes ?? []) out.push(n);
  out.push("[/STATE]");

  let text = out.join("\n");
  if (text.length > STATE_MAX_CHARS && mode === "full") {
    return renderStateBlock({ ...input, mode: "compact" });
  }
  if (text.length > STATE_MAX_CHARS) {
    // Collapse the oldest complete one-liners into a count.
    const keep = out.filter((line, i) => i === 0 || !/^L\d+ .* \[ok\]$/.test(line) || out.indexOf(line) > out.length - 12);
    const dropped = out.length - keep.length;
    if (dropped > 0) keep.splice(1, 0, `…and ${dropped} more complete lines (call get_order_state to see them)`);
    text = keep.join("\n");
  }
  return text;
}

/** The user message content for a caller turn: STATE block + the caller's words. */
export function buildUserTurnContent(args: {
  stateBlock: string | null;
  asides: string[];
  text: string;
}): Array<{ type: "text"; text: string }> {
  const blocks: Array<{ type: "text"; text: string }> = [];
  if (args.stateBlock) blocks.push({ type: "text", text: args.stateBlock });
  const said = args.asides.length
    ? `(You already said out loud, just now: ${args.asides.map((a) => JSON.stringify(a)).join(" ")} — do not repeat any of it.)\n${args.text}`
    : args.text;
  blocks.push({ type: "text", text: said });
  return blocks;
}

/** The caller's words out of a user message we built (block content or plain string). */
export function callerTextOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content.filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => String(b.text));
    const last = texts[texts.length - 1] ?? "";
    return last.replace(/^\(You already said out loud[^\n]*\)\n/, "");
  }
  return "";
}
