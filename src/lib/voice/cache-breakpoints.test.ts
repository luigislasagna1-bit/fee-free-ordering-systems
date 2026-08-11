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
