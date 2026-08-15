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
 *                                [--generate N [--taxonomy a,b] [--seed 42]
 *                                              [--caller script|llm] [--gen-model <id>]]
 *                                [--generated <path>]
 *                                [--stress N]
 *
 *   --suite        default critical (injection scenarios are in it too)
 *   --repeat       runs per scenario (default 1); 3 is the release gate
 *   --budget-cents HARD STOP: once the running total of model spend passes this
 *                  many cents, remaining runs are skipped (reported as
 *                  "budget_exhausted") — Luigi 2026-08-15: no more $100 cycles.
 *   --concurrency  parallel calls (default 3; --stress defaults to N)
 *   --restaurant   fixture slug override (default: each scenario's own)
 *   --model        agent model override (else NABIL_MODEL / config default)
 *   --out          report dir (default reports/nabil-sim/generated — gitignored;
 *                  pass reports/nabil-sim for a committed release report)
 *   --dry          list the scenarios and an estimated cost; no API calls
 *   --verbose      print every caller/Nabil line live
 *
 *   --generate N   ADVERSARIAL: ask the generator model for N scenarios
 *                  (round-robin over --taxonomy, validated through the real
 *                  compiler), save them to reports/nabil-sim/generated/<seed>.json
 *                  and run them as suite "broad". All normal flags apply.
 *                  With --dry: print the digest size + a prompt sample, no model.
 *   --taxonomy     comma list of buckets (default: all eleven — see generator.ts)
 *   --seed         generation seed (default 42) — the file name and the ids
 *   --caller       script (default) or llm — how the generated caller talks
 *   --gen-model    generator model (default claude-sonnet-5)
 *   --generated    re-run a saved set instead of generating
 *   --stress N     run the first N scenarios of --suite (cycling) ALL AT ONCE
 *                  and audit for cross-call leaks; exit 1 on any leak.
 *                  (--against ws://host:port is out of scope — see stress.ts)
 *
 * Exit code 1 when any CRITICAL-suite scenario failed in any run, or when
 * --stress found a leak.
 * Needs ANTHROPIC_API_KEY (from .env.local / .env / the environment).
 */
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import type { Scenario, ScenarioReport } from "../src/lib/voice/sim/scenario-types";
import type { MenuSnapshot } from "../src/lib/voice/sim/snapshot-types";
import { scenariosForSuite } from "../src/lib/voice/sim/scenarios/index";
import { computeMetrics } from "../src/lib/voice/sim/metrics";
import { renderTaxonomyReasonTable, writeReport } from "../src/lib/voice/sim/report";
import { ensureSimEnv, runScenario, type AnthropicLike } from "../src/lib/voice/sim/harness";
import { DEFAULT_CALLER_MODEL } from "../src/lib/voice/sim/caller-sim";
import { buildMenuDigest, DEFAULT_GENERATOR_MODEL, generateScenarios, loadGeneratedScenarios, sampleGeneratorMessages, serializeGeneratedSet, TAXONOMY } from "../src/lib/voice/sim/generator";
import { runStress } from "../src/lib/voice/sim/stress";

/* ─────────────────────────────── args ──────────────────────────────────── */

type Args = {
  suite: string;
  ids: string[] | null;
  repeat: number;
  concurrency: number;
  concurrencySet: boolean;
  restaurant: string | null;
  model: string | null;
  callerModel: string | null;
  out: string;
  timeoutMs: number;
  dry: boolean;
  verbose: boolean;
  generate: number | null;
  taxonomy: string[] | null;
  seed: number;
  caller: "script" | "llm";
  genModel: string | null;
  generated: string | null;
  stress: number | null;
  budgetCents: number | null;
};

const GENERATED_DIR = "reports/nabil-sim/generated";

function parseArgs(argv: string[]): Args {
  const a: Args = {
    suite: "critical",
    ids: null,
    repeat: 1,
    concurrency: 3,
    concurrencySet: false,
    restaurant: null,
    model: null,
    callerModel: null,
    out: GENERATED_DIR,
    timeoutMs: 60_000,
    dry: false,
    verbose: false,
    generate: null,
    taxonomy: null,
    seed: 42,
    caller: "script",
    genModel: null,
    generated: null,
    stress: null,
    budgetCents: null,
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
      case "--concurrency": a.concurrency = Math.max(1, parseInt(val(), 10) || 1); a.concurrencySet = true; break;
      case "--restaurant": a.restaurant = val(); break;
      case "--model": a.model = val(); break;
      case "--caller-model": a.callerModel = val(); break;
      case "--out": a.out = val(); break;
      case "--timeout": a.timeoutMs = Math.max(1000, parseInt(val(), 10) || 60_000); break;
      case "--dry": a.dry = true; break;
      case "--verbose": a.verbose = true; break;
      case "--generate": a.generate = Math.max(1, parseInt(val(), 10) || 1); break;
      case "--taxonomy": a.taxonomy = val().split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--seed": a.seed = parseInt(val(), 10) || 42; break;
      case "--budget-cents": a.budgetCents = Math.max(1, parseInt(val(), 10) || 1); break;
      case "--caller": {
        const v = val();
        if (v !== "script" && v !== "llm") throw new Error(`--caller must be script or llm`);
        a.caller = v;
        break;
      }
      case "--gen-model": a.genModel = val(); break;
      case "--generated": a.generated = val(); break;
      case "--stress": a.stress = Math.max(1, parseInt(val(), 10) || 1); break;
      default:
        throw new Error(`Unknown flag ${arg}`);
    }
  }
  if (a.generate !== null || a.generated !== null) a.suite = "broad";
  if (a.taxonomy) {
    const known = new Set<string>(TAXONOMY);
    const bad = a.taxonomy.filter((t) => !known.has(t));
    if (bad.length) throw new Error(`Unknown taxonomy bucket(s): ${bad.join(", ")} (known: ${TAXONOMY.join(", ")})`);
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

/** `--dry --generate`: the digest size and a prompt sample, no model. */
function dryGenerate(args: Args) {
  const snapshot = loadFixture(args.restaurant ?? "luigis");
  const digest = buildMenuDigest(snapshot);
  const taxonomy = args.taxonomy ?? [...TAXONOMY];
  const kinds = { pizza: 0, combo: 0, item: 0 };
  for (const e of digest.entries) kinds[e.kind]++;
  console.log(`--generate ${args.generate} (dry): would ask ${args.genModel ?? DEFAULT_GENERATOR_MODEL} for ${args.generate} scenario(s), seed ${args.seed}, caller ${args.caller}, round-robin over [${taxonomy.join(", ")}]`);
  console.log(`digest: ${digest.text.length.toLocaleString()} chars, ${digest.entries.length} entries (${kinds.pizza} pizzas, ${kinds.combo} combos, ${kinds.item} simple), ${digest.families.size} family-member pizzas, ${digest.toppings.length} toppings`);
  console.log(`would write: ${resolve(GENERATED_DIR, `${args.seed}.json`)}\n`);
  const sample = sampleGeneratorMessages(digest, taxonomy[0], args.seed, 1);
  console.log(`── system prompt (${sample.system.length.toLocaleString()} chars) — first 60 lines ──`);
  console.log(sample.system.split("\n").slice(0, 60).join("\n"));
  console.log(`   … (${Math.max(0, sample.system.split("\n").length - 60)} more lines)`);
  console.log(`\n── user prompt for scenario #1 ──\n${sample.user}\n`);
  console.log("No API calls made.");
}

/** Cycle `scenarios` to exactly `n` entries. */
const cycle = <T>(xs: T[], n: number): T[] => Array.from({ length: n }, (_, i) => xs[i % xs.length]);

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.dry && args.generate !== null) {
    dryGenerate(args);
    return;
  }

  let scenarios: Scenario[];
  let generatedPath: string | null = null;
  if (args.generated !== null) {
    scenarios = await loadGeneratedScenarios(resolve(process.cwd(), args.generated));
    console.log(`Loaded ${scenarios.length} generated scenario(s) from ${args.generated}`);
  } else if (args.generate !== null) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("ANTHROPIC_API_KEY is not set — --generate needs the model (use --dry --generate to preview the prompt).");
      process.exit(2);
    }
    const { default: Anthropic } = (await import("@anthropic-ai/sdk")) as unknown as { default: new (o: { apiKey: string }) => AnthropicLike };
    const anthropic = new Anthropic({ apiKey });
    const snapshot = loadFixture(args.restaurant ?? "luigis");
    const started = Date.now();
    console.log(`Generating ${args.generate} scenario(s) with ${args.genModel ?? DEFAULT_GENERATOR_MODEL} (seed ${args.seed}, caller ${args.caller}) …`);
    scenarios = await generateScenarios({
      anthropic,
      snapshot,
      count: args.generate,
      taxonomy: args.taxonomy ?? undefined,
      seed: args.seed,
      model: args.genModel ?? undefined,
      callerMode: args.caller,
      restaurant: args.restaurant ?? "luigis",
      log: (line) => console.log(line),
    });
    generatedPath = resolve(process.cwd(), GENERATED_DIR, `${args.seed}.json`);
    mkdirSync(resolve(process.cwd(), GENERATED_DIR), { recursive: true });
    writeFileSync(generatedPath, serializeGeneratedSet({ seed: args.seed, generatedAt: new Date().toISOString(), model: args.genModel ?? DEFAULT_GENERATOR_MODEL, taxonomy: args.taxonomy ?? [...TAXONOMY], scenarios }), "utf8");
    console.log(`Generated ${scenarios.length}/${args.generate} in ${((Date.now() - started) / 1000).toFixed(0)}s → ${generatedPath}`);
    if (!scenarios.length) {
      console.error("Nothing to run — every generated scenario was dropped.");
      process.exit(2);
    }
  } else {
    scenarios = scenariosForSuite(args.suite);
  }
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
  if (args.stress !== null) {
    scenarios = cycle(scenarios, args.stress);
    if (!args.concurrencySet) args.concurrency = args.stress;
  }

  if (args.dry) {
    if (args.stress !== null) console.log(`Stress: ${scenarios.length} call(s) at once (concurrency ${args.concurrency}) from suite "${args.suite}", then a cross-call leak audit\n`);
    else console.log(`Suite "${args.suite}": ${scenarios.length} scenario(s) × ${args.repeat} run(s)\n`);
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

  if (args.stress !== null) {
    await stressMain(args, scenarios, anthropic);
    return;
  }

  const jobs: Array<() => Promise<ScenarioReport>> = [];
  let spentCents = 0;
  let budgetStops = 0;
  for (const s of scenarios) {
    for (let run = 1; run <= args.repeat; run++) {
      jobs.push(async () => {
        if (args.budgetCents !== null && spentCents >= args.budgetCents) {
          budgetStops++;
          return crashReport(s, run, new Error(`budget_exhausted: ${spentCents}¢ spent of the ${args.budgetCents}¢ budget`));
        }
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
          spentCents += r.costCents;
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
  if (budgetStops) console.log(`\n💸 budget stop: ${budgetStops} run(s) skipped after ${spentCents}¢ of the ${args.budgetCents}¢ budget was spent.`);
  const metrics = computeMetrics(reports);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const name = `${stamp}-${args.suite}${args.generate !== null || args.generated !== null ? `-seed${args.seed}` : ""}${args.ids ? `-${args.ids.join("_").slice(0, 40)}` : ""}${args.repeat > 1 ? `-x${args.repeat}` : ""}`;
  const paths = writeReport(args.out, name, { reports, metrics, args: { ...args, generatedPath }, scenarios, generatedAt: new Date().toISOString() });

  console.log("");
  console.log(`${pad("id", 34)} ${pad("run", 4)} ${pad("pass", 5)} ${pad("placed", 7)} ${pad("cart", 9)} ${pad("turns", 6)} ${pad("ttfa p95", 9)} ${pad("cost", 7)} first reason`);
  for (const r of [...reports].sort((a, b) => a.id.localeCompare(b.id) || a.run - b.run)) {
    console.log(
      `${pad(r.id, 34)} ${pad(String(r.run), 4)} ${pad(r.pass ? "PASS" : "FAIL", 5)} ${pad(r.placed ? "yes" : "no", 7)} ${pad(r.cartDiff.exact ? "exact" : `${r.cartDiff.matched}/${r.cartDiff.items.total}+${r.cartDiff.extra.length}`, 9)} ${pad(String(r.turns.length), 6)} ${pad(r.latency.ttftP95 === null ? "–" : `${Math.round(r.latency.ttftP95)}ms`, 9)} ${pad(`$${(r.costCents / 100).toFixed(2)}`, 7)} ${r.reasons[0] ?? ""}`,
    );
  }
  console.log("");
  console.log(
    `pass ${(metrics.passRate * 100).toFixed(1)}% · exact cart ${(metrics.exactCartAccuracy * 100).toFixed(1)}% · items ${(metrics.itemAccuracy * 100).toFixed(1)}% · modifiers ${(metrics.modifierAccuracy * 100).toFixed(1)}% · halves ${(metrics.halfSideAccuracy * 100).toFixed(1)}% · slots ${(metrics.comboSlotAccuracy * 100).toFixed(1)}% · TTFA p95 ${metrics.ttftP95 ?? "–"}ms · cost $${(metrics.totalCostCents / 100).toFixed(2)} · model ${metrics.modelCentsPerEstMinute.toFixed(1)}¢/est-min (budget 30¢${metrics.modelCentsPerEstMinute > 30 ? " 🔴 OVER" : " 🟢"})`,
  );
  if (metrics.flakyIds.length) console.log(`flaky: ${metrics.flakyIds.join(", ")}`);
  if (metrics.failedIds.length) console.log(`failed: ${metrics.failedIds.join(", ")}`);
  if (scenarios.some((s) => s.suite.includes("broad"))) {
    console.log("\ntaxonomy × reason bucket:");
    console.log(renderTaxonomyReasonTable(reports, scenarios));
  }
  console.log(`report: ${paths.md}\n        ${paths.json}`);

  const criticalFailed = reports.some((r) => !r.pass && (scenarios.find((s) => s.id === r.id)?.suite ?? []).includes("critical"));
  process.exit(criticalFailed ? 1 : 0);
}

/** `--stress N`: everything at once, then the leak audit. Exit 1 on any leak. */
async function stressMain(args: Args, scenarios: Scenario[], anthropic: AnthropicLike) {
  const snapshot = loadFixture(args.restaurant ?? scenarios[0].restaurant);
  const mixed = scenarios.some((s) => (args.restaurant ?? s.restaurant) !== snapshot.slug);
  if (mixed) console.warn(`(stress runs every scenario on one fixture — "${snapshot.slug}"; pass --restaurant to choose)`);
  console.log(`Stress: ${scenarios.length} call(s), concurrency ${args.concurrency}, fixture ${snapshot.slug} …`);
  const started = Date.now();
  const { reports, leaks, checks } = await runStress({
    anthropic,
    snapshot,
    scenarios,
    concurrency: args.concurrency,
    log: (line) => (args.verbose || /^[▶✅❌]/.test(line) ? console.log(line) : undefined),
    runOpts: { model: args.model ?? undefined, callerModel: args.callerModel ?? DEFAULT_CALLER_MODEL, timeoutPerTurnMs: args.timeoutMs },
  });
  const metrics = computeMetrics(reports);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const paths = writeReport(args.out, `${stamp}-stress-${args.suite}-x${scenarios.length}`, { reports, metrics, args: { ...args, leaks, checks }, scenarios, generatedAt: new Date().toISOString() });
  console.log("");
  console.log(`${pad("id", 34)} ${pad("run", 4)} ${pad("pass", 5)} ${pad("placed", 7)} ${pad("cart", 9)} ${pad("turns", 6)} ${pad("ttfa p95", 9)} first reason`);
  for (const r of [...reports].sort((a, b) => a.id.localeCompare(b.id) || a.run - b.run)) {
    console.log(`${pad(r.id, 34)} ${pad(String(r.run), 4)} ${pad(r.pass ? "PASS" : "FAIL", 5)} ${pad(r.placed ? "yes" : "no", 7)} ${pad(r.cartDiff.exact ? "exact" : `${r.cartDiff.matched}/${r.cartDiff.items.total}+${r.cartDiff.extra.length}`, 9)} ${pad(String(r.turns.length), 6)} ${pad(r.latency.ttftP95 === null ? "–" : `${Math.round(r.latency.ttftP95)}ms`, 9)} ${r.reasons[0] ?? ""}`);
  }
  console.log("");
  console.log(`${((Date.now() - started) / 1000).toFixed(0)}s wall · pass ${(metrics.passRate * 100).toFixed(1)}% · exact cart ${(metrics.exactCartAccuracy * 100).toFixed(1)}% · TTFA p95 ${metrics.ttftP95 ?? "–"}ms · cost $${(metrics.totalCostCents / 100).toFixed(2)}`);
  console.log(`leak checks: menu ids ${checks.menuIds ? "✓" : "–"} · own cart ${checks.ownCart ? "✓" : "–"} · order numbers ${checks.orderNumbers ? "✓" : "–"} · idempotency prefix ${checks.idempotency ? "✓" : "not exercised (needs the call's backend — see stress.ts)"}`);
  if (leaks.length) {
    console.log(`\n🚨 ${leaks.length} LEAK finding(s):`);
    for (const l of leaks) console.log(`  - ${l}`);
  } else console.log("no cross-call leaks found");
  console.log(`report: ${paths.md}\n        ${paths.json}`);
  process.exit(leaks.length ? 1 : 0);
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
