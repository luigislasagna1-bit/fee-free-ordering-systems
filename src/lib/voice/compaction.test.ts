/**
 * Context compaction for long calls (`services/nabil-voice/src/compaction.ts`).
 * Old tool payloads and old STATE blocks carry no transactional truth (the
 * cart is authoritative and re-rendered every turn), so they are stubbed or
 * dropped and everything older than the kept tail becomes a deterministic
 * digest of NON-transactional facts. Rarely, all at once — never a little
 * every turn.
 */
import { describe, expect, it } from "vitest";
import {
  compact,
  shouldCompact,
  estimateTokens,
  digestLines,
  createCompactionState,
  KEEP_TURNS,
  COMPACT_EVERY_TURNS,
  COMPACT_WHEN_EST_TOKENS,
  KEEP_STATE_BLOCKS,
  type MessageMeta,
  type TranscriptEntry,
} from "../../../services/nabil-voice/src/compaction";

/** One caller turn as the session records it: [STATE + caller text] → assistant
 *  tool_use → tool_result → assistant final. Plus transcript entries. */
function buildCall(turns: number, opts: { toolPayload?: (t: number) => unknown; withThinking?: boolean } = {}) {
  const messages: any[] = [];
  const meta: MessageMeta[] = [];
  const transcript: TranscriptEntry[] = [];
  const payload = opts.toolPayload ?? ((t: number) => ({ ok: false, error: true, code: "unknown_item", lineId: `L${t}`, filler: "x".repeat(300) }));
  for (let t = 1; t <= turns; t++) {
    messages.push({ role: "user", content: [{ type: "text", text: `[STATE t=${t} | cart=h${t}]\nL1 1× Coke [ok]\n[/STATE]` }, { type: "text", text: `caller says ${t}` }] });
    meta.push({ turn: t, kind: "user" });
    messages.push({
      role: "assistant",
      content: [
        ...(opts.withThinking ? [{ type: "thinking", thinking: "hmm", signature: "sig" }] : []),
        { type: "tool_use", id: `tu${t}`, name: "add_to_order", input: { menuItemId: "x" } },
      ],
    });
    meta.push({ turn: t, kind: "assistant" });
    messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: `tu${t}`, content: JSON.stringify(payload(t)) }] });
    meta.push({ turn: t, kind: "tool_result", toolNames: ["add_to_order"] });
    messages.push({ role: "assistant", content: [{ type: "text", text: `Nabil reply ${t}` }] });
    meta.push({ turn: t, kind: "assistant" });
    transcript.push({ role: "user", text: `caller says ${t}`, ts: "t", turn: t });
    transcript.push({ role: "assistant", text: `Nabil reply ${t}`, ts: "t", turn: t });
  }
  return { messages, meta, transcript };
}

describe("shouldCompact / estimateTokens", () => {
  it("is a no-op under both thresholds", () => {
    const { messages } = buildCall(5);
    const cs = createCompactionState();
    expect(shouldCompact(messages, cs, 5)).toBe(false);
    expect(shouldCompact(messages, cs, KEEP_TURNS)).toBe(false);
    expect(shouldCompact(buildCall(11).messages, cs, 11)).toBe(false);
  });

  it("triggers every 12 turns (once past the kept window) and on a large history", () => {
    const cs = createCompactionState();
    expect(shouldCompact(buildCall(12).messages, cs, COMPACT_EVERY_TURNS)).toBe(true);
    // a big history triggers early — but never inside the first KEEP_TURNS turns
    const big = buildCall(9, { toolPayload: () => ({ ok: true, blob: "y".repeat(40_000) }) });
    expect(estimateTokens(big.messages)).toBeGreaterThan(COMPACT_WHEN_EST_TOKENS);
    expect(shouldCompact(big.messages, cs, 9)).toBe(true);
    const bigEarly = buildCall(4, { toolPayload: () => ({ ok: true, blob: "y".repeat(40_000) }) });
    expect(shouldCompact(bigEarly.messages, cs, 4)).toBe(false);
    // after a compaction at 12 the periodic trigger waits another 12 turns
    cs.lastCompactionTurn = 12;
    expect(shouldCompact(buildCall(20).messages, cs, 20)).toBe(false);
    expect(shouldCompact(buildCall(24).messages, cs, 24)).toBe(true);
  });

  it("estimateTokens is bytes/4 over the serialised content", () => {
    expect(estimateTokens([{ role: "user", content: "abcd" }])).toBe(Math.ceil('"abcd"'.length / 4));
    expect(estimateTokens([])).toBe(0);
  });
});

describe("digestLines", () => {
  it("keeps caller/Nabil lines in (from, through], drops acks and synthetic prompts, truncates long lines", () => {
    const transcript: TranscriptEntry[] = [
      { role: "user", text: "caller says 1", ts: "", turn: 1 },
      { role: "user", text: "Okay.", ts: "", turn: 1 },
      { role: "user", text: "yes", ts: "", turn: 2 },
      { role: "user", text: "(You were interrupted mid-sentence)", ts: "", turn: 2 },
      { role: "user", text: "(You are nearing the end of the call)", ts: "", turn: 2 },
      { role: "assistant", text: "Nabil   reply\n 2", ts: "", turn: 2 },
      { role: "user", text: "x".repeat(200), ts: "", turn: 3 },
      { role: "user", text: "too new", ts: "", turn: 4 },
      { role: "user", text: "no turn", ts: "" },
    ];
    const out = digestLines(transcript, 0, 3);
    expect(out).toEqual(["Caller: caller says 1", "Nabil: Nabil reply 2", `Caller: ${"x".repeat(117)}…`]);
    expect(digestLines(transcript, 1, 3)).toEqual(["Nabil: Nabil reply 2", `Caller: ${"x".repeat(117)}…`]);
  });
});

describe("compact", () => {
  it("keeps the last KEEP_TURNS caller turns verbatim and folds the rest into a note pair", () => {
    const { messages, meta, transcript } = buildCall(12);
    const cs = createCompactionState();
    const out = compact({ messages, meta, transcript, turn: 12, cs });
    expect(out.changed).toBe(true);
    expect(out.meta).toHaveLength(out.messages.length); // meta stays index-aligned
    // head: user digest + assistant "Noted."
    expect(out.messages[0].role).toBe("user");
    expect(String(out.messages[0].content)).toMatch(/^\[CONVERSATION SO FAR — historical notes only\./);
    expect(out.messages[1]).toEqual({ role: "assistant", content: "Noted." });
    expect(out.meta[0]).toEqual({ turn: 12, kind: "note" });
    expect(out.meta[1]).toEqual({ turn: 12, kind: "note" });
    // roles still alternate around the note pair
    expect(out.messages[2].role).toBe("user");
    // tail starts at caller turn 5 = 12 - KEEP_TURNS + 1
    expect(out.meta[2]).toEqual({ turn: 12 - KEEP_TURNS + 1, kind: "user" });
    const userTurnsKept = out.meta.filter((m) => m.kind === "user").map((m) => m.turn);
    expect(userTurnsKept).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(out.droppedMessages).toBe(4 * 4); // turns 1..4 × 4 messages each
    expect(out.bytesAfter).toBeLessThan(out.bytesBefore);
    // digest covers turns 1..4 only, caller AND Nabil, and never the kept turns
    const digest = String(out.messages[0].content);
    for (const t of [1, 2, 3, 4]) {
      expect(digest).toContain(`Caller: caller says ${t}`);
      expect(digest).toContain(`Nabil: Nabil reply ${t}`);
    }
    expect(digest).not.toContain("caller says 5");
    expect(cs.digestedThroughTurn).toBe(4);
    expect(cs.lastCompactionTurn).toBe(12);
    expect(cs.digest).toContain("Caller: caller says 4");
  });

  it("stubs tool_result payloads older than 4 turns down to one line, keeping error codes and lineIds", () => {
    const { messages, meta, transcript } = buildCall(12, {
      toolPayload: (t) => (t % 2 ? { ok: false, error: true, code: "unknown_item", lineId: `L${t}`, filler: "x".repeat(300) } : { ok: true, lineId: `L${t}`, line: { status: "needs_info", questions: ["Which size?"] }, needsInfo: true, filler: "y".repeat(300) }),
    });
    const out = compact({ messages, meta, transcript, turn: 12, cs: createCompactionState() });
    const results = out.messages.map((m, i) => [m, out.meta[i]] as const).filter(([, mm]) => mm.kind === "tool_result");
    for (const [m, mm] of results) {
      const content = m.content[0].content as string;
      if (mm.turn <= 12 - 4) {
        const stub = JSON.parse(content);
        expect(stub.compacted).toBe(true);
        expect(content).not.toContain("filler");
        if (mm.turn % 2) expect(stub).toEqual({ compacted: true, error: true, code: "unknown_item", lineId: `L${mm.turn}` });
        else expect(stub).toEqual({ compacted: true, applied: true, lineId: `L${mm.turn}`, needsInfo: true });
      } else {
        expect(content).toContain("filler"); // recent results stay verbatim
      }
    }
    expect(results.some(([, mm]) => mm.turn <= 8)).toBe(true);
    expect(results.some(([, mm]) => mm.turn > 8)).toBe(true);
  });

  it("drops old STATE blocks but keeps the caller's words; the newest KEEP_STATE_BLOCKS stay", () => {
    const { messages, meta, transcript } = buildCall(12);
    const out = compact({ messages, meta, transcript, turn: 12, cs: createCompactionState() });
    const users = out.messages.map((m, i) => [m, out.meta[i]] as const).filter(([, mm]) => mm.kind === "user");
    expect(users).toHaveLength(8);
    for (const [m, mm] of users) {
      const texts = (m.content as any[]).map((b) => b.text);
      expect(texts[texts.length - 1]).toBe(`caller says ${mm.turn}`); // caller text always survives
      if (mm.turn > 12 - KEEP_STATE_BLOCKS) {
        expect(texts).toHaveLength(2);
        expect(texts[0]).toMatch(/^\[STATE /);
      } else {
        expect(texts).toEqual([`caller says ${mm.turn}`]);
      }
    }
  });

  it("strips old thinking blocks from kept assistant messages", () => {
    const { messages, meta, transcript } = buildCall(12, { withThinking: true });
    const out = compact({ messages, meta, transcript, turn: 12, cs: createCompactionState() });
    const assistants = out.messages.filter((m, i) => out.meta[i].kind === "assistant" && Array.isArray(m.content));
    expect(assistants.length).toBeGreaterThan(0);
    for (const m of assistants) expect((m.content as any[]).some((b) => b.type === "thinking")).toBe(false);
    expect(assistants.some((m) => (m.content as any[]).some((b) => b.type === "tool_use"))).toBe(true);
  });

  it("a second compaction advances digestedThroughTurn and never digests a turn twice", () => {
    const { messages, meta, transcript } = buildCall(24);
    const cs = createCompactionState();
    // first pass at turn 12 over the first 12 turns of history
    const first = compact({ messages: messages.slice(0, 12 * 4), meta: meta.slice(0, 12 * 4), transcript, turn: 12, cs });
    expect(cs.digestedThroughTurn).toBe(4);
    // history continues from the compacted prefix
    const grown = [...first.messages, ...messages.slice(12 * 4)];
    const grownMeta = [...first.meta, ...meta.slice(12 * 4)];
    const second = compact({ messages: grown, meta: grownMeta, transcript, turn: 24, cs });
    expect(cs.digestedThroughTurn).toBe(16);
    expect(cs.lastCompactionTurn).toBe(24);
    const digest = String(second.messages[0].content);
    for (const t of [1, 4, 5, 16]) expect(digest.split(`Caller: caller says ${t}\n`).length - 1).toBe(1);
    expect(digest).not.toContain("caller says 17");
    // exactly one note pair, at the head
    expect(second.meta.filter((m) => m.kind === "note")).toHaveLength(2);
    expect(second.meta.filter((m) => m.kind === "user").map((m) => m.turn)).toEqual([17, 18, 19, 20, 21, 22, 23, 24]);
  });

  it("appends ledger notes and bounds the digest to DIGEST_MAX_CHARS, oldest first to go", () => {
    const { messages, meta } = buildCall(12);
    const transcript: TranscriptEntry[] = [];
    for (let t = 1; t <= 4; t++) for (let k = 0; k < 15; k++) transcript.push({ role: "user", text: `turn ${t} line ${k} ${"z".repeat(100)}`, ts: "", turn: t });
    const cs = createCompactionState();
    const out = compact({ messages, meta, transcript, turn: 12, cs, ledger: ["caller is allergic to nuts"] });
    const body = String(out.messages[0].content);
    expect(body).toContain("Note: caller is allergic to nuts");
    expect(cs.digest.length).toBeLessThanOrEqual(4_000);
    expect(cs.digest).not.toContain("turn 1 line 0 ");
    expect(cs.digest).toContain("turn 4 line 14 ");
  });

  it("without any old turns the note pair is omitted and the tail is untouched", () => {
    const { messages, meta, transcript } = buildCall(3);
    const out = compact({ messages, meta, transcript, turn: 3, cs: createCompactionState() });
    expect(out.messages).toHaveLength(messages.length);
    expect(out.meta.filter((m) => m.kind === "note")).toHaveLength(0);
    expect(out.droppedMessages).toBe(0);
  });
});

describe("compact + the bookkeeping merge (session.ts prepends tool_results to a caller turn)", () => {
  it("drops orphaned tool_result blocks at the cut and still strips the old STATE behind them", () => {
    const { messages, meta, transcript } = buildCall(12);
    // Turn 5 is the first kept caller turn (12 - KEEP_TURNS + 1). Make it a
    // MERGED turn: it starts with tool_result blocks answering turn 4's
    // bookkeeping tool_use, which is about to be folded into the digest.
    const idx = meta.findIndex((m) => m.kind === "user" && m.turn === 5);
    messages[idx] = {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "merged1", content: JSON.stringify({ ok: true, applied: true }) },
        { type: "tool_result", tool_use_id: "merged2", content: JSON.stringify({ ok: true, applied: true }) },
        ...messages[idx].content,
      ],
    };
    const out = compact({ messages, meta, transcript, turn: 12, cs: createCompactionState() });
    const first = out.messages[2]; // after the note pair
    expect(out.meta[2]).toEqual({ turn: 5, kind: "user" });
    // No orphan tool_result may lead the kept history (its tool_use is gone).
    expect(first.content.some((b: any) => b.type === "tool_result")).toBe(false);
    // Turn 5's STATE block is older than the newest KEEP_STATE_BLOCKS → stripped, caller words kept.
    expect(first.content.map((b: any) => b.text)).toEqual(["caller says 5"]);
    // A merged turn INSIDE the kept window keeps its tool_results (their tool_use is kept too).
    const idx9 = out.meta.findIndex((m) => m.kind === "user" && m.turn === 9);
    expect(idx9).toBeGreaterThan(0);
  });
});
