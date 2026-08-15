/**
 * The whole loop, end to end, without spending a cent: a FAKE model that emits
 * scripted tool_use hops drives the REAL CallSession against the offline
 * backend on Luigi's fixture, and the harness must report an exact cart, a
 * placed order, and a pass. Also covers standing `answers`, the exhausted-
 * script stop rule, mustPlace=false, and the clarification rule.
 */
import { describe, expect, it } from "vitest";
import snapshotJson from "./fixtures/luigis.menu.json";
import type { MenuSnapshot } from "./snapshot-types";
import type { Scenario } from "./scenario-types";
import { runScenario } from "./harness";

const snapshot = snapshotJson as unknown as MenuSnapshot;
const VANILLA_COKE = "cmpuex6qg0b1q04kv88agzzad"; // 3.49, no options → 3.94 with 13% tax
const WINGS = "cmpuex6kl0ay804kvuo7b8w4d";

type Reply = { text?: string; tools?: Array<{ name: string; input: Record<string, unknown> }>; ttft?: number };

/** A stand-in for the Anthropic streaming client: each `stream()` call plays
 *  the next scripted reply — text as deltas, tools as tool_use blocks. */
function fakeAnthropic(replies: Reply[]) {
  let call = 0;
  let toolSeq = 0;
  const seen: any[] = [];
  return {
    calls: () => call,
    seen,
    messages: {
      stream: (params: any, opts?: { signal?: AbortSignal }) => {
        seen.push(params);
        const reply = replies[call++] ?? { text: "Okay." };
        const listeners: Array<(d: string) => void> = [];
        const aborted = () => Object.assign(new Error("aborted"), { name: "AbortError" });
        const run = async () => {
          if (reply.ttft) await new Promise((r) => setTimeout(r, reply.ttft));
          const deltas = reply.text ? reply.text.split(/(?<=\s)/) : [];
          for (const d of deltas) {
            await Promise.resolve();
            if (opts?.signal?.aborted) throw aborted();
            for (const l of listeners) l(d);
          }
          const content: any[] = [];
          if (reply.text) content.push({ type: "text", text: reply.text });
          for (const t of reply.tools ?? []) content.push({ type: "tool_use", id: `tu_${++toolSeq}`, name: t.name, input: t.input });
          return {
            stop_reason: reply.tools?.length ? "tool_use" : "end_turn",
            content,
            usage: { input_tokens: 1200, output_tokens: 40, cache_read_input_tokens: 9000, cache_creation_input_tokens: 0 },
          };
        };
        let started: Promise<unknown> | null = null;
        return {
          on: (evt: string, cb: (d: string) => void) => {
            if (evt === "text") listeners.push(cb);
          },
          finalMessage: () => (started ??= run()),
        };
      },
    },
  };
}

const baseScenario = (over: Partial<Scenario> & Pick<Scenario, "id" | "caller" | "expected">): Scenario => ({
  title: over.id,
  suite: ["critical"],
  restaurant: "luigis",
  taxonomy: ["test"],
  ...over,
});

describe("runScenario end-to-end (fake model, real session, real compiler)", () => {
  it("adds a Coke by id → pickup → name → quote → place, and the report passes with an exact cart", async () => {
    const anthropic = fakeAnthropic([
      // turn 1: three tools in one hop, then a spoken confirmation
      { tools: [{ name: "add_to_order", input: { menuItemId: VANILLA_COKE, quantity: 1 } }, { name: "set_fulfilment", input: { type: "pickup" } }, { name: "set_customer", input: { name: "Luigi Rossi" } }] },
      { text: "Got it — one Vanilla Coke Can, for pickup, under Luigi Rossi. Anything else?" },
      // turn 2
      { tools: [{ name: "quote_order", input: {} }] },
      { text: "1. Vanilla Coke Can. For pickup, your total is $3.94 including tax. Shall I place it?" },
      // turn 3
      { tools: [{ name: "place_order", input: {} }] },
      { text: "Done — your order is in. See you soon!" },
    ]);
    const scn = baseScenario({
      id: "H01_coke_pickup",
      caller: { mode: "script", turns: ["Hi, can I get a Vanilla Coke can for pickup? Name's Luigi Rossi.", "No, that's it.", "Yes, go ahead."] },
      expected: { cart: { lines: [{ item: VANILLA_COKE, qty: 1, options: [] }] }, fulfilment: { type: "pickup" }, customer: { name: "Luigi Rossi" }, mustPlace: true, totalCents: 394 },
    });
    const log: string[] = [];
    const r = await runScenario(scn, { anthropic, snapshot, timeoutPerTurnMs: 10_000, log: (l) => log.push(l) });

    expect(r.reasons).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.placed).toBe(true);
    expect(r.cartDiff.exact).toBe(true);
    expect(r.actualCart.lines).toEqual([{ item: VANILLA_COKE, name: "Vanilla Coke Can", qty: 1, options: [] }]);
    expect(r.fulfilment?.type).toBe("pickup");
    expect(r.customerName).toBe("Luigi Rossi");
    expect(r.turns).toHaveLength(3);
    expect(r.turns.map((t) => t.scriptIndex)).toEqual([0, 1, 2]);
    expect(r.turns[0].toolCalls.map((t) => t.name)).toEqual(["add_to_order", "set_fulfilment", "set_customer"]);
    expect(r.turns[0].toolCalls.every((t) => t.ok)).toBe(true);
    expect(r.turns[0].clarified).toBe(false); // asked "anything else?" but a line was added
    expect(r.turns[1].toolCalls.map((t) => t.name)).toEqual(["quote_order"]);
    expect(r.turns[2].toolCalls.map((t) => t.name)).toEqual(["place_order"]);
    expect(r.turns[0].cartHashBefore).not.toBe(r.turns[0].cartHashAfter);
    expect(r.transcript.map((t) => t.role)).toEqual(["caller", "nabil", "caller", "nabil", "caller", "nabil"]);
    expect(r.transcript[3].text).toMatch(/\$3\.94/);
    expect(r.usage.in).toBeGreaterThan(0);
    expect(r.usage.cacheRead).toBeGreaterThan(0);
    expect(r.latency.ttftP50).not.toBeNull();
    expect(typeof r.versions.promptVersion).toBe("string");
    expect(r.versions.menuSnapshotHash).toBeTruthy();
    expect(anthropic.calls()).toBe(6);
    // The session's system prompt is what the real call would use (menu-derived).
    expect(String(anthropic.seen[0].system?.[0]?.text ?? "")).toMatch(/Luigi/);
    expect(anthropic.seen[0].tools.some((t: any) => t.name === "add_to_order")).toBe(true);
    expect(log.some((l) => l.includes("caller>"))).toBe(true);
  }, 30_000);

  it("standing answers reply to Nabil's questions without consuming the script, and the run stops when the script is done and Nabil stops asking", async () => {
    const anthropic = fakeAnthropic([
      { tools: [{ name: "add_to_order", input: { menuItemId: VANILLA_COKE } }] },
      { text: "One Vanilla Coke Can. Is that for pickup or delivery?" },
      { tools: [{ name: "set_fulfilment", input: { type: "pickup" } }] },
      { text: "Pickup it is. What name should I put on the order?" },
      { tools: [{ name: "set_customer", input: { name: "Luigi Rossi" } }, { name: "quote_order", input: {} }] },
      { text: "Thanks Luigi. Your total is $3.94 including tax. Shall I place it?" },
      { tools: [{ name: "place_order", input: {} }] },
      { text: "All set, it's placed. Bye now." },
    ]);
    const scn = baseScenario({
      id: "H02_answers",
      caller: {
        mode: "script",
        turns: ["A Vanilla Coke can please."],
        answers: { "pick ?up or delivery": "Pickup.", "what name": "Luigi Rossi.", "shall i place": "Yes." },
      },
      expected: { cart: { lines: [{ item: VANILLA_COKE, qty: 1, options: [] }] }, mustPlace: true },
    });
    const r = await runScenario(scn, { anthropic, snapshot, timeoutPerTurnMs: 10_000 });
    expect(r.reasons).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.turns.map((t) => t.caller)).toEqual(["A Vanilla Coke can please.", "Pickup.", "Luigi Rossi.", "Yes."]);
    expect(r.turns.map((t) => t.scriptIndex)).toEqual([0, null, null, null]);
    // Turn 0 added a complete line while asking → not a clarification; "what
    // name?" after set_fulfilment touched no line → clarified.
    expect(r.turns[0].clarified).toBe(false);
    expect(r.turns[1].clarified).toBe(true);
    expect(anthropic.calls()).toBe(8);
  }, 30_000);

  it("fails honestly: mustPlace=true but the model never places, and a wrong item is diffed", async () => {
    const anthropic = fakeAnthropic([
      { tools: [{ name: "add_to_order", input: { menuItemId: WINGS, size: "20", options: ["hot mixed"] } }] },
      { text: "Twenty wings, hot mixed. Anything else?" },
      { text: "Okay, thanks for calling. Bye!" },
    ]);
    const scn = baseScenario({
      id: "H03_not_placed",
      caller: { mode: "script", turns: ["Twenty wings hot mixed for pickup.", "That's it, bye."] },
      expected: { cart: { lines: [{ item: VANILLA_COKE, qty: 1, options: [] }] }, mustPlace: true },
    });
    const r = await runScenario(scn, { anthropic, snapshot, timeoutPerTurnMs: 10_000 });
    expect(r.pass).toBe(false);
    expect(r.placed).toBe(false);
    expect(r.cartDiff.exact).toBe(false);
    expect(r.cartDiff.missing.map((l) => l.item)).toEqual([VANILLA_COKE]);
    expect(r.cartDiff.extra.map((l) => l.item)).toEqual([WINGS]);
    expect(r.actualCart.lines[0]).toMatchObject({ item: WINGS, size: "20", options: ["hot mixed"] });
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/^cart mismatch/), expect.stringMatching(/NOT placed/)]));
  }, 30_000);

  it("mustClarifyAt: a needs_info add while asking counts as a clarification; the loop guard stops a repeated answer", async () => {
    // Wings with a size but no "How would you like them?" choice: the engine
    // creates a needs_info line (required group, no default) and the model asks.
    const anthropic = fakeAnthropic([
      { tools: [{ name: "add_to_order", input: { menuItemId: WINGS, size: "20" } }] },
      { text: "Twenty wings — how would you like them? Hot mixed, mild mixed, honey garlic…?" },
      { tools: [{ name: "update_line", input: { lineId: "L1", setOptions: ["hot mixed"] } }] },
      { text: "Twenty hot mixed wings. Anything else?" },
      { text: "And how would you like them?" }, // a stuck agent re-asking
      { text: "And how would you like them?" },
      { text: "And how would you like them?" },
      { text: "And how would you like them?" },
    ]);
    const scn = baseScenario({
      id: "H04_clarify",
      caller: { mode: "script", turns: ["Twenty wings for pickup.", "Hot mixed."], answers: { "how would you like": "Hot mixed." } },
      expected: { cart: { lines: [{ item: WINGS, qty: 1, size: "20", options: ["hot mixed"] }] }, mustPlace: false, mustClarifyAt: [0] },
    });
    const r = await runScenario(scn, { anthropic, snapshot, timeoutPerTurnMs: 10_000 });
    expect(r.turns[0].clarified).toBe(true);
    expect(r.turns[0].toolCalls[0]).toMatchObject({ name: "add_to_order", ok: true });
    expect(r.clarifications.expectedAt).toEqual([0]);
    expect(r.clarifications.actualAt).toContain(0);
    // Turn 1 is the standing answer, NOT the scripted "Hot mixed." — the script turn comes after.
    expect(r.turns.slice(0, 3).map((t) => [t.caller, t.scriptIndex])).toEqual([
      ["Twenty wings for pickup.", 0],
      ["Hot mixed.", null],
      ["Hot mixed.", 1],
    ]);
    // Cart came from the (unplaced) engine state; the wings are complete at size 20.
    expect(r.cartDiff.exact).toBe(true);
    expect(r.placed).toBe(false);
    // The re-asking model was answered at most twice in a row, then the caller closed and stopped.
    const answers = r.turns.filter((t) => t.caller === "Hot mixed." && t.scriptIndex === null).length;
    expect(answers).toBe(3);
    expect(r.turns[r.turns.length - 1].caller).toBe("That's all, thanks.");
    expect(r.turns).toHaveLength(6);
    expect(r.pass).toBe(true);
  }, 30_000);
});
