import { describe, expect, it } from "vitest";
import { withMessageCacheBreakpoint } from "../../../services/nabil-voice/src/cache-breakpoints";

/**
 * The rules that keep the second breakpoint from becoming a bug: the stored
 * messages are never mutated (a stale marker would burn one of the four
 * breakpoints a request is allowed, and past four the API rejects the call).
 */
describe("withMessageCacheBreakpoint", () => {
  it("marks only the last message", () => {
    const msgs = [
      { role: "user", content: "hi" },
      { role: "assistant", content: [{ type: "text", text: "hello" }] },
      { role: "user", content: "a large pepperoni" },
    ];
    const out = withMessageCacheBreakpoint(msgs as never) as any[];
    const marked = out.flatMap((m) =>
      (Array.isArray(m.content) ? m.content : []).filter((b: any) => b.cache_control),
    );
    expect(marked).toHaveLength(1);
    expect(out[2].content[0].cache_control).toEqual({ type: "ephemeral" });
  });

  it("never mutates the stored messages", () => {
    const last = { role: "user", content: [{ type: "text", text: "hi" }] };
    const msgs = [last];
    withMessageCacheBreakpoint(msgs as never);
    expect((last.content[0] as Record<string, unknown>).cache_control).toBeUndefined();
  });

  it("widens string content to a text block so the marker has somewhere to live", () => {
    const out = withMessageCacheBreakpoint([{ role: "user", content: "hi" }] as never) as any[];
    expect(out[0].content).toEqual([{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }]);
  });

  it("marks the LAST block of a multi-block message (tool results)", () => {
    const out = withMessageCacheBreakpoint([
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "a", content: "ok" },
          { type: "tool_result", tool_use_id: "b", content: "ok" },
        ],
      },
    ] as never) as any[];
    expect(out[0].content[0].cache_control).toBeUndefined();
    expect(out[0].content[1].cache_control).toEqual({ type: "ephemeral" });
  });

  it("passes through empty or malformed input untouched", () => {
    expect(withMessageCacheBreakpoint([] as never)).toEqual([]);
    const weird = [{ role: "user", content: [] }];
    expect(withMessageCacheBreakpoint(weird as never)).toBe(weird);
  });

  it("earlier messages keep their identity — no needless copying", () => {
    const first = { role: "user", content: "one" };
    const out = withMessageCacheBreakpoint([first, { role: "user", content: "two" }] as never) as any[];
    expect(out[0]).toBe(first);
  });
});

/* ─────────────── the rolling anchor and the 20-block cliff ─────────────── */

/**
 * A breakpoint walks back at most 20 content blocks to find the previous cache
 * entry. One tool-heavy turn appends 2k+2 blocks — 18 at the 8-hop ceiling — so
 * a single busy pizza turn can jump clean over the window, after which every
 * request silently re-prefills the whole conversation. Seconds of dead air,
 * no error. That is the leading suspect for "fine for a minute, then laggy".
 *
 * The anchor exists to sit inside the window. These tests pin the two things
 * that make it work: it must be BEHIND the tail (or it caches nothing extra),
 * and it must be STABLE (a marker that moves every turn is written once and
 * read never).
 */
import { withMessageCacheBreakpoints, ANCHOR_ADVANCE_AT, LOOKBACK_BLOCKS } from "../../../services/nabil-voice/src/cache-breakpoints";

const msg = (role: string, blocks: number) => ({
  role,
  content: Array.from({ length: blocks }, (_, i) => ({ type: "text", text: `b${i}` })),
});
const markedIndexes = (out: any[]) =>
  out.flatMap((m, i) => ((Array.isArray(m.content) ? m.content : []).some((b: any) => b.cache_control) ? [i] : []));

describe("withMessageCacheBreakpoints — rolling anchor", () => {
  it("marks the tail and one anchor behind it, never more", () => {
    const msgs = [msg("user", 1), msg("assistant", 1), msg("user", 1), msg("assistant", 1)];
    const { messages: out } = withMessageCacheBreakpoints(msgs as never, null);
    const marks = markedIndexes(out);
    // Two breakpoints max here — the system block uses a third, and four is the
    // API ceiling.
    expect(marks).toHaveLength(2);
    expect(marks[marks.length - 1]).toBe(out.length - 1);
    expect(marks[0]).toBeLessThan(out.length - 1);
  });

  it("keeps the anchor STILL while the tail is close enough to find it", () => {
    const msgs = [msg("user", 1), msg("assistant", 1), msg("user", 1)];
    const first = withMessageCacheBreakpoints(msgs as never, null);
    // One more short exchange — well inside the lookback.
    const grown = [...msgs, msg("assistant", 1), msg("user", 1)];
    const second = withMessageCacheBreakpoints(grown as never, first.anchorIndex);
    // Same position ⇒ the entry written last turn is the entry read this turn.
    expect(second.anchorIndex).toBe(first.anchorIndex);
  });

  it("advances the anchor before a heavy turn can outrun the lookback", () => {
    const msgs = [msg("user", 1), msg("assistant", 1), msg("user", 1)];
    const first = withMessageCacheBreakpoints(msgs as never, null);
    // A full 8-hop pizza turn: assistant with 9 blocks, tool results with 8.
    const grown = [...msgs, msg("assistant", 9), msg("user", 8)];
    const second = withMessageCacheBreakpoints(grown as never, first.anchorIndex);
    expect(second.anchorIndex).not.toBe(first.anchorIndex);
    // And the new anchor is within reach of the tail, which is the whole point.
    let blocksBehind = 0;
    for (let i = (second.anchorIndex as number) + 1; i < grown.length; i++) {
      blocksBehind += (grown[i].content as unknown[]).length;
    }
    expect(blocksBehind).toBeLessThan(LOOKBACK_BLOCKS);
    expect(ANCHOR_ADVANCE_AT).toBeLessThan(LOOKBACK_BLOCKS);
  });

  it("never mutates the stored messages", () => {
    const a = msg("user", 1);
    const b = msg("assistant", 1);
    const c = msg("user", 1);
    withMessageCacheBreakpoints([a, b, c] as never, null);
    for (const m of [a, b, c]) {
      for (const blk of m.content) expect((blk as Record<string, unknown>).cache_control).toBeUndefined();
    }
  });

  it("survives a single message with nothing to anchor against", () => {
    const { messages: out, anchorIndex } = withMessageCacheBreakpoints([msg("user", 1)] as never, null);
    expect(markedIndexes(out)).toEqual([0]);
    expect(anchorIndex).toBeNull();
  });

  it("ignores a stale anchor index that no longer exists", () => {
    const msgs = [msg("user", 1), msg("assistant", 1)];
    const { anchorIndex } = withMessageCacheBreakpoints(msgs as never, 99);
    expect(anchorIndex === null || anchorIndex < msgs.length - 1).toBe(true);
  });
});
