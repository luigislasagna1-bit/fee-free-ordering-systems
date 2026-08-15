/**
 * NABIL SIMULATION — run scripted / LLM-simulated callers against the REAL
 * voice session, offline, on a menu snapshot, with the REAL Anthropic model,
 * and grade the FINAL CART (never the transcript) against each scenario.
 *
 *   npx tsx scripts/nabil-sim.ts [--suite critical|injection|broad|all]
 *                                [--ids T03,T08] [--repeat N] [--concurrency N]
 *                                [--restaurant luigis] [--model <id>]
 *                                [--caller-model <id>] [--out dir]
 *                                [--timeout ms] [--dry] [--verbose]
 *
 *   --suite        default critical (injection scenarios are in it too)
 *   --repeat       runs per scenario (default 1); 3 is the release gate
 *   --concurrency  parallel calls (default 3)
 *   --restaurant   fixture slug override (default: each scenario's own)
 *   --model        agent model override (else NABIL_MODEL / config default)
 *   --out          report dir (default reports/nabil-sim/generated — gitignored;
 *                  pass reports/nabil-sim for a committed release report)
 *   --dry          list the scenarios and an estimated cost; no API calls
 *   --verbose      print every caller/Nabil line live
 *
 * Exit code 1 when any CRITICAL-suite scenario failed in any run.
 * Needs ANTHROPIC_API_KEY (from .env.local / .env / the environment).
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import type { Scenario, ScenarioReport } from "../src/lib/voice/sim/scenario-types";
import type { MenuSnapshot } from "../src/lib/voice/sim/snapshot-types";
import { scenariosForSuite } from "../src/lib/voice/sim/scenarios/index";
import { computeMetrics } from "../src/lib/voice/sim/metrics";
import { writeReport } from "../src/lib/voice/sim/report";
import { ensureSimEnv, runScenario, type AnthropicLike } from "../src/lib/voice/sim/harness";
import { DEFAULT_CALLER_MODEL } from "../src/lib/voice/sim/caller-sim";

/* ─────────────────────────────── args ──────────────────────────────────── */

type Args = {
  suite: string;
  ids: string[] | null;
  repeat: number;
  concurrency: number;
  restaurant: string | null;
  model: string | null;
  callerModel: string | null;
  out: string;
  timeoutMs: number;
  dry: boolean;
  verbose: boolean;
};

function parseArgs(argv: string[]): Args {
  const a: Args = {
    suite: "critical",
    ids: null,
    repeat: 1,
    concurrency: 3,
    restaurant: null,
    model: null,
    callerModel: null,
    out: "reports/nabil-sim/generated",
    timeoutMs: 60_000,
    dry: false,
    verbose: false,
  };
  const take = (i: number, flag: string) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf("=");
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : null;
    const val = () => (inline !== null ? inline : take(i++, flag));
    if (flag === "--help" || flag === "-h") {
      console.log(readFileSync(new URL(import.meta.url)).toString().split("*/")[0]);
      process.exit(0);
    }
    switch (flag) {
      case "--suite": a.suite = val(); break;
      case "--ids": a.ids = val().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--repeat": a.repeat = Math.max(1, parseInt(val(), 10) || 1); break;
      case "--concurrency": a.concurrency = Math.max(1, parseInt(val(), 10) || 1); break;
      case "--restaurant": a.restaurant = val(); break;
      case "--model": a.model = val(); break;
      case "--caller-model": a.callerModel = val(); break;
      case "--out": a.out = val(); break;
      case "--timeout": a.timeoutMs = Math.max(1000, parseInt(val(), 10) || 60_000); break;
      case "--dry": a.dry = true; break;
      case "--verbose": a.verbose = true; break;
      default:
        throw new Error(`Unknown flag ${arg}`);
    }
  }
  return a;
}

/* ─────────────────────────────── helpers ───────────────────────────────── */

const fixtureCache = new Map<string, MenuSnapshot>();
function loadFixture(slug: string): MenuSnapshot {
  const cached = fixtureCache.get(slug);
  if (cached) return cached;
  const path = resolve(process.cwd(), "src/lib/voice/sim/fixtures", `${slug}.menu.json`);
  if (!existsSync(path)) throw new Error(`No fixture for restaurant "${slug}" at ${path} — run scripts/nabil-snapshot-menu.ts <slug> first.`);
  const snap = JSON.parse(readFileSync(path, "utf8")) as MenuSnapshot;
  fixtureCache.set(slug, snap);
  return snap;
}

/** Rough spend guess for --dry: ~2.5¢ per caller turn with a warm cache
 *  (Sonnet, ~15k cached prefix + ~1k out per turn), llm callers add ~0.3¢. */
function estimateCents(s: Scenario, repeat: number): number {
  const turns = s.caller.mode === "script" ? s.caller.turns.length + 3 : Math.ceil((s.caller.maxTurns ?? 30) / 2);
  const perTurn = s.caller.mode === "script" ? 2.5 : 2.8;
  return Math.round(turns * perTurn * repeat);
}

async function withConcurrency<T>(n: number, jobs: Array<() => Promise<T>>): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await jobs[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
  return out;
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

/* ─────────────────────────────── main ──────────────────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let scenarios = scenariosForSuite(args.suite);
  if (args.ids) {
    const want = new Set(args.ids);
    scenarios = scenarios.filter((s) => want.has(s.id) || args.ids!.some((id) => s.id.startsWith(id)));
    const missing = args.ids.filter((id) => !scenarios.some((s) => s.id === id || s.id.startsWith(id)));
    if (missing.length) console.warn(`(no scenario matches: ${missing.join(", ")})`);
  }
  if (!scenarios.length) {
    console.error(`No scenarios for suite "${args.suite}"${args.ids ? ` ids ${args.ids.join(",")}` : ""}.`);
    process.exit(2);
  }

  if (args.dry) {
    console.log(`Suite "${args.suite}": ${scenarios.length} scenario(s) × ${args.repeat} run(s)\n`);
    console.log(`${pad("id", 34)} ${pad("mode", 7)} ${pad("turns", 6)} ${pad("restaurant", 12)} ${pad("est. cost", 10)} title`);
    let total = 0;
    for (const s of scenarios) {
      const c = estimateCents(s, args.repeat);
      total += c;
      const turns = s.caller.mode === "script" ? String(s.caller.turns.length) : `≤${s.caller.maxTurns ?? 30}`;
      console.log(`${pad(s.id, 34)} ${pad(s.caller.mode, 7)} ${pad(turns, 6)} ${pad(args.restaurant ?? s.restaurant, 12)} ${pad(`~$${(c / 100).toFixed(2)}`, 10)} ${s.title}`);
      // Fail fast on a missing fixture even in dry mode.
      loadFixture(args.restaurant ?? s.restaurant);
    }
    console.log(`\nEstimated total ≈ $${(total / 100).toFixed(2)} (rough; the real number is in the report). No API calls made.`);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set (checked .env.local, .env, environment). Use --dry to list scenarios without it.");
    process.exit(2);
  }
  ensureSimEnv();
  const { default: Anthropic } = (await import("@anthropic-ai/sdk")) as unknown as { default: new (o: { apiKey: string }) => AnthropicLike };
  const anthropic = new Anthropic({ apiKey });

  const jobs: Array<() => Promise<ScenarioReport>> = [];
  for (const s of scenarios) {
    for (let run = 1; run <= args.repeat; run++) {
      jobs.push(async () => {
        const snapshot = loadFixture(args.restaurant ?? s.restaurant);
        const started = Date.now();
        console.log(`▶ ${s.id} run ${run}/${args.repeat} …`);
        const log = args.verbose ? (line: string) => console.log(`[${s.id}#${run}]${line}`) : undefined;
        try {
          const r = await runScenario(s, {
            anthropic,
            snapshot,
            run,
            model: args.model ?? undefined,
            callerModel: args.callerModel ?? DEFAULT_CALLER_MODEL,
            timeoutPerTurnMs: args.timeoutMs,
            log,
          });
          console.log(`${r.pass ? "✅" : "❌"} ${s.id} run ${run} — ${((Date.now() - started) / 1000).toFixed(1)}s, ${r.turns.length} turns, $${(r.costCents / 100).toFixed(2)}${r.pass ? "" : ` — ${r.reasons[0]}`}`);
          return r;
        } catch (e) {
          console.error(`💥 ${s.id} run ${run} crashed:`, e);
          return crashReport(s, run, e);
        }
      });
    }
  }
  const reports = await withConcurrency(args.concurrency, jobs);
  const metrics = computeMetrics(reports);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `${stamp}-${args.suite}${args.ids ? `-${args.ids.join("_").slice(0, 40)}` : ""}${args.repeat > 1 ? `-x${args.repeat}` : ""}`;
  const paths = writeReport(args.out, name, { reports, metrics, args: { ...args }, scenarios, generatedAt: new Date().toISOString() });

  console.log("");
  console.log(`${pad("id", 34)} ${pad("run", 4)} ${pad("pass", 5)} ${pad("placed", 7)} ${pad("cart", 9)} ${pad("turns", 6)} ${pad("ttfa p95", 9)} ${pad("cost", 7)} first reason`);
  for (const r of [...reports].sort((a, b) => a.id.localeCompare(b.id) || a.run - b.run)) {
    console.log(
      `${pad(r.id, 34)} ${pad(String(r.run), 4)} ${pad(r.pass ? "PASS" : "FAIL", 5)} ${pad(r.placed ? "yes" : "no", 7)} ${pad(r.cartDiff.exact ? "exact" : `${r.cartDiff.matched}/${r.cartDiff.items.total}+${r.cartDiff.extra.length}`, 9)} ${pad(String(r.turns.length), 6)} ${pad(r.latency.ttftP95 === null ? "–" : `${Math.round(r.latency.ttftP95)}ms`, 9)} ${pad(`$${(r.costCents / 100).toFixed(2)}`, 7)} ${r.reasons[0] ?? ""}`,
    );
  }
  console.log("");
  console.log(
    `pass ${(metrics.passRate * 100).toFixed(1)}% · exact cart ${(metrics.exactCartAccuracy * 100).toFixed(1)}% · items ${(metrics.itemAccuracy * 100).toFixed(1)}% · modifiers ${(metrics.modifierAccuracy * 100).toFixed(1)}% · halves ${(metrics.halfSideAccuracy * 100).toFixed(1)}% · slots ${(metrics.comboSlotAccuracy * 100).toFixed(1)}% · TTFA p95 ${metrics.ttftP95 ?? "–"}ms · cost $${(metrics.totalCostCents / 100).toFixed(2)}`,
  );
  if (metrics.flakyIds.length) console.log(`flaky: ${metrics.flakyIds.join(", ")}`);
  if (metrics.failedIds.length) console.log(`failed: ${metrics.failedIds.join(", ")}`);
  console.log(`report: ${paths.md}\n        ${paths.json}`);

  const criticalFailed = reports.some((r) => !r.pass && (scenarios.find((s) => s.id === r.id)?.suite ?? []).includes("critical"));
  process.exit(criticalFailed ? 1 : 0);
}

function crashReport(s: Scenario, run: number, e: unknown): ScenarioReport {
  return {
    id: s.id,
    run,
    pass: false,
    reasons: [`harness crashed: ${String((e as Error)?.stack ?? e).slice(0, 400)}`],
    cartDiff: { exact: false, missing: s.expected.cart.lines, extra: [], matched: 0, items: { correct: 0, total: s.expected.cart.lines.length }, sizes: { correct: 0, total: 0 }, qty: { correct: 0, total: 0 }, modifiers: { correct: 0, total: 0 }, halves: { correct: 0, total: 0 }, comboSlots: { correct: 0, total: 0 }, humanSummary: ["harness crashed"] },
    actualCart: { lines: [] },
    placed: false,
    fulfilment: null,
    customerName: null,
    turns: [],
    hallucinationFlags: [],
    clarifications: { expectedAt: s.expected.mustClarifyAt ?? [], actualAt: [] },
    mustNotSayHits: [],
    latency: { ttftP50: null, ttftP95: null, toolP95: null },
    usage: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 },
    costCents: 0,
    durationMs: 0,
    versions: {},
    transcript: [],
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
