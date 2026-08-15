/**
 * STRESS MODE — N scenarios at once, in one process, then a cross-call
 * LEAK audit. Every call gets its own session, fake phone line and fake
 * backend (`runScenario` isolates them), so anything that bleeds from one
 * call into another must be module-level state somewhere in the voice
 * service — exactly the class of bug only concurrency shows.
 *
 * Checks (each finding is one string in `leaks`):
 *  1. every menuItemId in every tool_use input is in the fixture — a foreign
 *     id would mean a call is seeing another store's (or another call's) menu;
 *  2. every report's actual cart equals its OWN expected cart (compareCarts) —
 *     a mismatch that only appears under load is a leak until proven otherwise;
 *  3. order numbers: a call's transcript may only mention order numbers ITS
 *     OWN backend issued to it. Every fake backend numbers from SIM-0001, so
 *     the literal "no order number appears in two transcripts" would flag two
 *     honest calls that both said "SIM-0001"; the equivalent non-degenerate
 *     test is "did this call speak a number it was never given?" — the numbers
 *     a call was given are read off the place_order tool_results the session
 *     sends back to the model (captured by wrapping the Anthropic client);
 *  4. every placed order's `idempotencyKey` starts with `voice-<that call's
 *     callSid>-`. This needs the call's backend, which `runScenario` does not
 *     hand back — it runs when the caller supplies a `runOne` that returns the
 *     backend (tests do); the CLI path reports it as not exercised.
 *
 * TODO(--against ws://host:port): running the same scenarios against a LIVE
 * voice service over its ConversationRelay WebSocket is out of scope here —
 * the harness drives an in-process CallSession only.
 */
import type { CanonicalCart, Scenario, ScenarioReport } from "./scenario-types";
import type { MenuSnapshot } from "./snapshot-types";
import type { FakeBackend } from "./fake-backend";
import { compareCarts } from "./compare-carts";
import { runScenario, type AnthropicLike, type RunScenarioOpts } from "./harness";

export type StressRunResult = { report: ScenarioReport; backend?: FakeBackend | null };

export type StressOpts = {
  anthropic: AnthropicLike;
  snapshot: MenuSnapshot;
  scenarios: Scenario[];
  concurrency?: number;
  log?: (line: string) => void;
  /** Extra runScenario options (model, timeouts…). */
  runOpts?: Omit<RunScenarioOpts, "anthropic" | "snapshot" | "run" | "log">;
  /** Injectable runner (tests). Defaults to `runScenario`; a runner that also
   *  returns the call's backend enables the idempotency-key check. */
  runOne?: (scn: Scenario, opts: RunScenarioOpts) => Promise<StressRunResult>;
  /** Called with each report as it lands (progress output). */
  onReport?: (r: ScenarioReport, index: number) => void;
};

export type StressResult = {
  reports: ScenarioReport[];
  leaks: string[];
  /** Which checks ran (the idempotency check needs backends). */
  checks: { menuIds: boolean; ownCart: boolean; orderNumbers: boolean; idempotency: boolean };
};

/** The callSid `runScenario` gives run `run` of scenario `scn` (harness.ts). */
export const callSidFor = (scn: Scenario, run: number) => `SIM${scn.id}r${run}`;

/** Recursively collect every `menuItemId` (and pick `item`) string in a tool input. */
export function collectMenuItemIds(input: unknown, out: string[] = []): string[] {
  if (!input || typeof input !== "object") return out;
  if (Array.isArray(input)) {
    for (const x of input) collectMenuItemIds(x, out);
    return out;
  }
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === "menuItemId" && typeof v === "string" && v.trim()) out.push(v.trim());
    else if (v && typeof v === "object") collectMenuItemIds(v, out);
  }
  return out;
}

const ORDER_NO_RE = /\bSIM-\d{4}\b/g;

/** Wrap a client so every request's messages are scanned for order numbers the
 *  session received back from ITS backend (place_order tool_results). */
export function orderNumberCapturingClient(inner: AnthropicLike): { client: AnthropicLike; issued: Set<string> } {
  const issued = new Set<string>();
  const scan = (v: unknown) => {
    const text = typeof v === "string" ? v : JSON.stringify(v ?? null);
    for (const m of text.matchAll(/"orderNumber"\s*:\s*"([^"]+)"/g)) issued.add(m[1]);
    for (const m of text.matchAll(/\\"orderNumber\\"\s*:\s*\\"([^"\\]+)\\"/g)) issued.add(m[1]);
  };
  const client: AnthropicLike = {
    messages: {
      stream: (params: unknown, opts?: { signal?: AbortSignal }) => {
        try {
          scan((params as { messages?: unknown } | null)?.messages);
        } catch {
          /* never let the audit break the call */
        }
        return inner.messages.stream(params, opts);
      },
    },
  };
  return { client, issued };
}

/** Pure: audit finished calls for cross-call leakage. */
export function auditLeaks(
  calls: Array<{ scenario: Scenario; run: number; report: ScenarioReport; issued: Set<string>; backend?: FakeBackend | null }>,
  snapshot: MenuSnapshot,
): { leaks: string[]; checks: StressResult["checks"] } {
  const leaks: string[] = [];
  const checks = { menuIds: true, ownCart: true, orderNumbers: true, idempotency: calls.some((c) => !!c.backend) };
  for (const c of calls) {
    const tag = `${c.scenario.id}#${c.run}`;
    // 1. menu ids
    const foreign = new Set<string>();
    for (const t of c.report.turns) for (const tc of t.toolCalls) for (const id of collectMenuItemIds(tc.input)) if (!snapshot.items[id]) foreign.add(id);
    if (foreign.size) leaks.push(`${tag}: tool inputs reference ids not in the fixture: ${[...foreign].join(", ")}`);
    // 2. own cart
    const diff = compareCarts(c.report.actualCart, withNames(c.scenario.expected.cart, snapshot));
    if (!diff.exact) leaks.push(`${tag}: cart ≠ its own expected under load: ${diff.humanSummary.slice(0, 4).join(" | ")}`);
    // 3. order numbers spoken that this call was never issued
    const spoken = new Set<string>();
    for (const t of c.report.transcript) if (t.role !== "caller") for (const m of t.text.matchAll(ORDER_NO_RE)) spoken.add(m[0]);
    const alien = [...spoken].filter((n) => !c.issued.has(n));
    if (alien.length) leaks.push(`${tag}: transcript mentions order number(s) this call was never issued: ${alien.join(", ")} (issued: ${[...c.issued].join(", ") || "none"})`);
    // 4. idempotency prefix
    if (c.backend) {
      const want = `voice-${callSidFor(c.scenario, c.run)}-`;
      for (const p of c.backend.placed) {
        if (!p.idempotencyKey) leaks.push(`${tag}: placed order ${p.orderNumber} has no idempotencyKey`);
        else if (!p.idempotencyKey.startsWith(want)) leaks.push(`${tag}: placed order ${p.orderNumber} idempotencyKey '${p.idempotencyKey}' does not start with '${want}'`);
      }
    }
  }
  return { leaks, checks };
}

/** Run every scenario concurrently, then audit. Distinct `run` numbers keep callSids unique when a scenario repeats. */
export async function runStress(opts: StressOpts): Promise<StressResult> {
  const log = opts.log ?? (() => {});
  const n = opts.scenarios.length;
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? n, n || 1));
  const runOne: NonNullable<StressOpts["runOne"]> = opts.runOne ?? (async (scn, o) => ({ report: await runScenario(scn, o) }));
  const runOf = new Map<string, number>();
  const jobs = opts.scenarios.map((scn, i) => {
    const run = (runOf.get(scn.id) ?? 0) + 1;
    runOf.set(scn.id, run);
    return async () => {
      const { client, issued } = orderNumberCapturingClient(opts.anthropic);
      log(`▶ [stress ${i + 1}/${n}] ${scn.id} run ${run}`);
      const started = Date.now();
      const { report, backend } = await runOne(scn, { ...(opts.runOpts ?? {}), anthropic: client, snapshot: opts.snapshot, run, log: (l) => log(`[${scn.id}#${run}]${l}`) });
      log(`${report.pass ? "✅" : "❌"} [stress ${i + 1}/${n}] ${scn.id} run ${run} — ${((Date.now() - started) / 1000).toFixed(1)}s${report.pass ? "" : ` — ${report.reasons[0]}`}`);
      opts.onReport?.(report, i);
      return { scenario: scn, run, report, issued, backend };
    };
  });
  const results: Array<Awaited<ReturnType<(typeof jobs)[number]>>> = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  const { leaks, checks } = auditLeaks(results, opts.snapshot);
  return { reports: results.map((r) => r.report), leaks, checks };
}

/** Same as harness.ts withNames: expected lines carry fixture names so diffs read as food. */
function withNames(cart: CanonicalCart, snapshot: MenuSnapshot): CanonicalCart {
  return {
    lines: cart.lines.map((l) => ({
      ...l,
      name: l.name ?? snapshot.items[l.item]?.name,
      ...(l.picks ? { picks: l.picks.map((p) => ({ ...p, name: p.name ?? snapshot.items[p.item]?.name })) } : {}),
    })),
  };
}
