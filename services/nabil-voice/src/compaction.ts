/**
 * CONTEXT COMPACTION for long calls (directive §9).
 *
 * The model's message history used to grow without bound: every tool result
 * (topping lists, order views, instructions) stayed verbatim for the whole
 * call — 1.7 M input tokens on a 4-minute call, and a real risk that a
 * 15-minute call degrades simply because the prompt is enormous.
 *
 * Because the CART is authoritative and re-rendered into every turn as the
 * STATE block, old tool payloads and old exchanges carry no transactional
 * truth. So, rarely (every ~12 turns or when the history is large), we:
 *   1. stub old tool_result payloads down to one line,
 *   2. drop old STATE blocks (the newest ones are re-rendered anyway),
 *   3. collapse everything older than the last KEEP_TURNS caller turns into
 *      one deterministic digest of NON-transactional facts (what was said,
 *      what was offered and declined) — the cart lines, totals and order
 *      numbers are deliberately NOT restated here; STATE is the only truth.
 *
 * Compaction rewrites the prefix, which costs one prompt-cache re-write; that
 * is why it runs seldom and all at once, never a little every turn.
 */
export type MessageMeta = {
  turn: number;
  kind: "user" | "assistant" | "tool_result" | "note" | "continuation";
  toolNames?: string[];
};

export type TranscriptEntry = { role: string; text: string; ts: string; turn?: number };

export const KEEP_TURNS = 8;
export const COMPACT_EVERY_TURNS = 12;
export const COMPACT_WHEN_EST_TOKENS = 24_000;
export const DIGEST_MAX_CHARS = 4_000;
export const KEEP_STATE_BLOCKS = 2;

const ACK = /^(ok(ay)?|yes|yeah|yep|sure|got it|thanks?|thank you|alright|right|mm-?hmm|uh-?huh|no)\W*$/i;

export function estimateTokens(messages: any[]): number {
  let bytes = 0;
  for (const m of messages) {
    try {
      bytes += JSON.stringify(m.content).length;
    } catch {
      /* ignore */
    }
  }
  return Math.ceil(bytes / 4);
}

export type CompactionState = {
  lastCompactionTurn: number;
  /** Turns already folded into the digest. */
  digestedThroughTurn: number;
  digest: string;
};

export function createCompactionState(): CompactionState {
  return { lastCompactionTurn: 0, digestedThroughTurn: 0, digest: "" };
}

export function shouldCompact(messages: any[], cs: CompactionState, turn: number): boolean {
  if (turn - cs.lastCompactionTurn >= COMPACT_EVERY_TURNS && turn > KEEP_TURNS) return true;
  return estimateTokens(messages) > COMPACT_WHEN_EST_TOKENS && turn > KEEP_TURNS;
}

function stubToolResult(block: any): any {
  let parsed: any = null;
  try {
    parsed = typeof block.content === "string" ? JSON.parse(block.content) : block.content;
  } catch {
    parsed = null;
  }
  const stub: Record<string, unknown> = { compacted: true };
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    if (parsed.ok === true) stub.applied = true;
    if (parsed.ok === false || parsed.error) {
      stub.error = true;
      if (parsed.code) stub.code = parsed.code;
    }
    if (parsed.lineId) stub.lineId = parsed.lineId;
    if (parsed.needsInfo) stub.needsInfo = true;
  }
  return { ...block, content: JSON.stringify(stub) };
}

/** Deterministic digest lines from transcript entries in (from, through]. */
export function digestLines(transcript: TranscriptEntry[], fromTurnExclusive: number, throughTurn: number): string[] {
  const out: string[] = [];
  for (const t of transcript) {
    if (t.turn === undefined || t.turn <= fromTurnExclusive || t.turn > throughTurn) continue;
    const text = String(t.text ?? "").replace(/\s+/g, " ").trim();
    if (!text || ACK.test(text)) continue;
    if (/^\(You were interrupted|^\(You are nearing|^\(continue exactly/.test(text)) continue;
    const who = t.role === "user" ? "Caller" : "Nabil";
    out.push(`${who}: ${text.length > 120 ? text.slice(0, 117) + "…" : text}`);
  }
  return out;
}

export function compact(args: {
  messages: any[];
  meta: MessageMeta[];
  transcript: TranscriptEntry[];
  turn: number;
  cs: CompactionState;
  ledger?: string[];
}): { messages: any[]; meta: MessageMeta[]; changed: boolean; droppedMessages: number; bytesBefore: number; bytesAfter: number } {
  const { messages, meta, transcript, turn, cs } = args;
  const bytesBefore = estimateTokens(messages) * 4;
  const boundaryTurn = turn - KEEP_TURNS; // everything with meta.turn <= boundaryTurn is folded
  // Cut at the first CALLER-turn user message newer than the boundary.
  let cut = messages.length;
  for (let i = 0; i < messages.length; i++) {
    if (meta[i]?.kind === "user" && meta[i].turn > boundaryTurn) {
      cut = i;
      break;
    }
  }
  const newLines = digestLines(transcript, cs.digestedThroughTurn, boundaryTurn);
  const ledger = (args.ledger ?? []).map((l) => `Note: ${l}`);
  let digest = [cs.digest, ...newLines].filter(Boolean).join("\n");
  // Oldest first to go.
  while (digest.length > DIGEST_MAX_CHARS) {
    const nl = digest.indexOf("\n");
    if (nl < 0) {
      digest = digest.slice(-DIGEST_MAX_CHARS);
      break;
    }
    digest = digest.slice(nl + 1);
  }
  const head: any[] = [];
  const headMeta: MessageMeta[] = [];
  const digestBody = [digest, ...ledger].filter(Boolean).join("\n");
  if (digestBody) {
    head.push({
      role: "user",
      content:
        "[CONVERSATION SO FAR — historical notes only. The STATE block on each turn is the ONLY truth about what is on the order; never rebuild the order from these notes.]\n" +
        digestBody,
    });
    headMeta.push({ turn, kind: "note" });
    head.push({ role: "assistant", content: "Noted." });
    headMeta.push({ turn, kind: "note" });
  }
  // Kept tail: stub old tool results, keep only the newest STATE blocks.
  const tail: any[] = [];
  const tailMeta: MessageMeta[] = [];
  const stateBlockTurns = meta
    .slice(cut)
    .filter((m) => m.kind === "user")
    .map((m) => m.turn);
  const keepStateFrom = stateBlockTurns.slice(-KEEP_STATE_BLOCKS)[0] ?? Infinity;
  for (let i = cut; i < messages.length; i++) {
    const m = messages[i];
    const mm = meta[i];
    if (mm?.kind === "tool_result" && Array.isArray(m.content) && mm.turn <= turn - 4) {
      tail.push({ ...m, content: m.content.map((b: any) => (b?.type === "tool_result" ? stubToolResult(b) : b)) });
    } else if (mm?.kind === "user" && Array.isArray(m.content) && m.content.length > 1 && mm.turn < keepStateFrom && /^\[STATE /.test(String(m.content[0]?.text ?? ""))) {
      tail.push({ ...m, content: m.content.slice(1) });
    } else if (mm?.kind === "assistant" && Array.isArray(m.content)) {
      // Old thinking blocks carry nothing the model can use next turn.
      const stripped = m.content.filter((b: any) => b?.type !== "thinking" && b?.type !== "redacted_thinking");
      tail.push(stripped.length ? { ...m, content: stripped } : m);
    } else tail.push(m);
    tailMeta.push(mm ?? { turn, kind: "user" });
  }
  const outMessages = [...head, ...tail];
  const outMeta = [...headMeta, ...tailMeta];
  cs.lastCompactionTurn = turn;
  cs.digestedThroughTurn = Math.max(cs.digestedThroughTurn, boundaryTurn);
  cs.digest = digest;
  return {
    messages: outMessages,
    meta: outMeta,
    changed: true,
    droppedMessages: Math.max(0, messages.length - tail.length),
    bytesBefore,
    bytesAfter: estimateTokens(outMessages) * 4,
  };
}
