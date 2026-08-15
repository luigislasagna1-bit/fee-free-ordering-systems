/**
 * The per-call event log (`services/nabil-voice/src/events.ts`): ordered,
 * timestamped, payload-capped, and bounded per call so one enormous tool
 * result or a runaway loop cannot bloat a call record.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEventSink, truncateJson, MAX_EVENTS_PER_CALL, MAX_EVENT_PAYLOAD_CHARS } from "../../../services/nabil-voice/src/events";

afterEach(() => vi.restoreAllMocks());

describe("createEventSink", () => {
  it("numbers events from 1 in emission order and stamps ts from the injected clock", () => {
    let t = 1_700_000_000_000;
    const sink = createEventSink(() => (t += 1000));
    sink.emit({ type: "call_start", turn: 0, versions: { agentVersion: "dev" }, from: "+1", to: "+2" });
    sink.emit({ type: "asr", turn: 1, text: "hi", lang: "en", synthetic: false });
    sink.emit({ type: "model_text", turn: 1, text: "Hello!", hop: 1, interrupted: false });
    expect(sink.size()).toBe(3);
    const evs = sink.drain();
    expect(evs.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(evs.map((e) => e.ts)).toEqual(["2023-11-14T22:13:21.000Z", "2023-11-14T22:13:22.000Z", "2023-11-14T22:13:23.000Z"]);
    expect(evs[1]).toMatchObject({ type: "asr", turn: 1, text: "hi" });
    // drain empties the buffer; seq keeps counting
    expect(sink.size()).toBe(0);
    sink.emit({ type: "error", turn: null, where: "x", message: "y" });
    expect(sink.drain().map((e) => e.seq)).toEqual([4]);
  });

  it("truncates big payload fields with a marker instead of storing them whole", () => {
    const sink = createEventSink(() => 0);
    const huge = { rows: Array.from({ length: 2000 }, (_, i) => `row-${i}-${"x".repeat(20)}`) };
    sink.emit({ type: "tool_use", turn: 1, hop: 1, toolUseId: "tu1", name: "get_item_options", input: { menuItemId: "x" }, cartHashBefore: null });
    sink.emit({ type: "tool_result", turn: 1, hop: 1, toolUseId: "tu1", name: "get_item_options", ok: true, code: null, ms: 12, output: huge, cartHashAfter: null });
    sink.emit({ type: "cart", turn: 1, hash: "h", lines: huge.rows, problems: [], fulfilment: { type: "pickup" } });
    const [use, result, cart] = sink.drain() as any[];
    // small payloads pass through untouched
    expect(use.input).toEqual({ menuItemId: "x" });
    // big ones are replaced by a marker + preview
    expect(result.output).toMatchObject({ _truncated: true, _chars: JSON.stringify(huge).length });
    expect(result.output.preview).toHaveLength(MAX_EVENT_PAYLOAD_CHARS);
    expect(result.output.preview.startsWith('{"rows":["row-0-')).toBe(true);
    expect(cart.lines).toMatchObject({ _truncated: true });
    expect(cart.problems).toEqual([]);
    expect(cart.fulfilment).toEqual({ type: "pickup" });
    // the event itself is not otherwise altered
    expect(result).toMatchObject({ seq: 2, type: "tool_result", name: "get_item_options", ok: true, ms: 12 });
  });

  it("stops at MAX_EVENTS_PER_CALL, warns once, and drops the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sink = createEventSink(() => 0);
    for (let i = 0; i < MAX_EVENTS_PER_CALL + 25; i++) sink.emit({ type: "asr", turn: i, text: `t${i}`, lang: null, synthetic: false });
    expect(sink.size()).toBe(MAX_EVENTS_PER_CALL);
    expect(warn).toHaveBeenCalledTimes(1);
    const evs = sink.drain();
    expect(evs[evs.length - 1].seq).toBe(MAX_EVENTS_PER_CALL);
    // once capped, the cap is for the whole call — draining does not reopen it
    sink.emit({ type: "asr", turn: 999, text: "late", lang: null, synthetic: false });
    expect(sink.size()).toBe(0);
  });
});

describe("truncateJson", () => {
  it("returns small values by reference, truncates large ones, and tolerates the unserialisable", () => {
    const small = { a: 1 };
    expect(truncateJson(small)).toBe(small);
    expect(truncateJson("x".repeat(10), 20)).toBe("x".repeat(10));
    const out = truncateJson("x".repeat(100), 20) as any;
    expect(out).toEqual({ _truncated: true, _chars: 102, preview: '"' + "x".repeat(19) });
    expect(truncateJson(undefined)).toBeUndefined();
    const cyc: any = { name: "loop" };
    cyc.self = cyc;
    expect(typeof truncateJson(cyc)).toBe("string");
    expect(truncateJson({ b: 1n } as any, 5)).toBe("[obje");
  });
});
