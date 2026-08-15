/**
 * NABIL REPLAY — re-run a REAL call as a simulation. Input is the Scenario
 * JSON the admin call page's "Turn this call into a regression case" button
 * downloads (src/lib/voice/regression-case.ts): the caller's ASR turns as the
 * script, and the order that was actually placed as the expected cart.
 *
 *   npx tsx scripts/nabil-replay.ts --file <regression.json> [--repeat 3]
 *                                   [--caller script|llm] [--restaurant luigis]
 *                                   [--model <id>] [--caller-model <id>]
 *                                   [--timeout ms] [--verbose] [--dry]
 *
 *   --file        the downloaded scenario (required)
 *   --repeat      runs (default 1)
 *   --caller      script (default: say the same words again) or llm (a model
 *                 plays "the same caller as the original call", told what
 *                 they ordered and what they said last time)
 *   --restaurant  fixture slug (default: the scenario's own `restaurant`)
 *   --model       agent model override
 *   --dry         resolve the fixture, print the drift check and what would
 *                 run; no API calls
 *
 * Fixture drift: when the JSON carries a top-level `menuSnapshotHash` (the
 * live menu hash at call time) and it differs from the fixture's `menuHash`,
 * a loud MENU DRIFT warning is printed and the replay continues — a changed
 * menu is the usual reason a replay diverges from the original call.
 *
 * Expected-cart hygiene: the regression builder cannot tell crust / sauce /
 * cheese from toppings and folds them into halves.whole with a review note,
 * and a call that never placed gets an "approximated" cart with empty ids.
 * Before comparing, this script drops the review notes and any pizza "topping"
 * that is not a topping-group option in the fixture, and says so.
 *
 * Reports are written NEXT TO the input: <name>.replay.json / <name>.replay.md.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import type { CanonicalLine, CanonicalPick, Scenario, ScenarioReport } from "../src/lib/voice/sim/scenario-types";
import type { MenuSnapshot } from "../src/lib/voice/sim/snapshot-types";
import { computeMetrics } from "../src/lib/voice/sim/metrics";
import { writeReport } from "../src/lib/voice/sim/report";
import { ensureSimEnv, runScenario, type AnthropicLike } from "../src/lib/voice/sim/harness";
import { DEFAULT_CALLER_MODEL } from "../src/lib/voice/sim/caller-sim";
import { renderCartGoal } from "../src/lib/voice/sim/generator";
import { toppingGroupIds } from "../src/lib/voice/sim/fake-pricer";

/* ─────────────────────────────── args ──────────────────────────────────── */

type Args = { file: string; repeat: number; caller: "script" | "llm"; restaurant: string | null; model: string | null; callerModel: string | null; timeoutMs: number; verbose: boolean; dry: boolean };

function parseArgs(argv: string[]): Args {
  const a: Args = { file: "", repeat: 1, caller: "script", restaurant: null, model: null, callerModel: null, timeoutMs: 60_000, verbose: false, dry: false };
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
      case "--file": a.file = val(); break;
      case "--repeat": a.repeat = Math.max(1, parseInt(val(), 10) || 1); break;
      case "--caller": {
        const v = val();
        if (v !== "script" && v !== "llm") throw new Error("--caller must be script or llm");
        a.caller = v;
        break;
      }
      case "--restaurant": a.restaurant = val(); break;
      case "--model": a.model = val(); break;
      case "--caller-model": a.callerModel = val(); break;
      case "--timeout": a.timeoutMs = Math.max(1000, parseInt(val(), 10) || 60_000); break;
      case "--verbose": a.verbose = true; break;
      case "--dry": a.dry = true; break;
      default:
        throw new Error(`Unknown flag ${arg}`);
    }
  }
  if (!a.file) throw new Error("--file <regression.json> is required");
  return a;
}

/* ─────────────────────────────── helpers ───────────────────────────────── */

type ReplayInput = Scenario & { menuSnapshotHash?: string };

function loadScenarioFile(path: string): ReplayInput {
  if (!existsSync(path)) throw new Error(`No such file: ${path}`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<ReplayInput>;
  const problems: string[] = [];
  if (typeof raw.id !== "string" || !raw.id) problems.push("id");
  if (!raw.caller || (raw.caller.mode !== "script" && raw.caller.mode !== "llm")) problems.push("caller.mode");
  if (!raw.expected || !raw.expected.cart || !Array.isArray(raw.expected.cart.lines)) problems.push("expected.cart.lines");
  if (typeof raw.expected?.mustPlace !== "boolean") problems.push("expected.mustPlace");
  if (problems.length) throw new Error(`${path} is not a Scenario JSON (missing/invalid: ${problems.join(", ")})`);
  const scn = raw as ReplayInput;
  return {
    ...scn,
    title: typeof scn.title === "string" && scn.title ? scn.title : scn.id,
    suite: Array.isArray(scn.suite) && scn.suite.length ? scn.suite : ["regression"],
    restaurant: typeof scn.restaurant === "string" && scn.restaurant ? scn.restaurant : "luigis",
    taxonomy: Array.isArray(scn.taxonomy) ? scn.taxonomy : ["regression"],
  };
}

function loadFixture(slug: string): MenuSnapshot {
  const path = resolve(process.cwd(), "src/lib/voice/sim/fixtures", `${slug}.menu.json`);
  if (!existsSync(path)) throw new Error(`No fixture for restaurant "${slug}" at ${path} — run scripts/nabil-snapshot-menu.ts <slug> first.`);
  return JSON.parse(readFileSync(path, "utf8")) as MenuSnapshot;
}

/** The regression builder's review notes (regression-case.ts PIZZA_NOTE / CART_NOTE). */
const REVIEW_NOTE_RE = /^(pizza line: crust\/sauce\/cheese|expected cart approximated)/i;

/**
 * Make the regression builder's best-effort cart comparable: drop review
 * notes; on fixture pizzas keep only real toppings under halves (the builder
 * folds crust/sauce/cheese/cook-level in because it cannot tell them apart).
 * Returns what was changed so the operator sees it.
 */
function sanitizeExpected(scn: Scenario, snapshot: MenuSnapshot): { scenario: Scenario; notes: string[] } {
  const notes: string[] = [];
  const toppingSet = (id: string): Set<string> | null => {
    const it = snapshot.items[id];
    if (!it?.pizzaConfig) return null;
    const tIds = toppingGroupIds(it);
    const s = new Set<string>();
    for (const g of it.modifierGroups) if (tIds.has(g.id)) for (const o of g.options) s.add(o.name.trim().toLowerCase());
    return s;
  };
  const cleanHalves = (l: CanonicalLine | CanonicalPick, who: string) => {
    const set = toppingSet(l.item);
    if (!set || !l.halves) return;
    for (const side of ["left", "right", "whole"] as const) {
      const keep: string[] = [];
      for (const t of l.halves[side]) {
        const bare = t.replace(/^\d+x\s*/i, "").trim().toLowerCase();
        if (set.has(bare)) keep.push(t);
        else notes.push(`${who}: dropped "${t}" from halves.${side} — not a topping on ${snapshot.items[l.item]?.name} (crust/sauce/cheese/cook level are not compared)`);
      }
      l.halves[side] = keep;
    }
  };
  const lines: CanonicalLine[] = scn.expected.cart.lines.map((raw, i) => {
    const l: CanonicalLine = JSON.parse(JSON.stringify(raw));
    const who = `line ${i + 1} (${l.name ?? (l.item || "no id")})`;
    if (l.note && REVIEW_NOTE_RE.test(l.note)) {
      notes.push(`${who}: dropped review note "${l.note}"`);
      delete l.note;
    }
    if (!l.item) notes.push(`${who}: has NO menu item id (approximated cart) — this line cannot match; the run will fail on the cart`);
    cleanHalves(l, who);
    for (const p of l.picks ?? []) cleanHalves(p, `${who} pick ${p.name ?? p.item}`);
    return l;
  });
  return { scenario: { ...scn, expected: { ...scn.expected, cart: { lines } } }, notes };
}

function toLlmCaller(scn: Scenario, snapshot: MenuSnapshot): Scenario {
  const turns = scn.caller.mode === "script" ? scn.caller.turns.map((t) => (typeof t === "string" ? t : t.say)) : [];
  const goal = [renderCartGoal(scn.expected, snapshot), "", "You said these things last time, in this order — say them again in your own words, reacting to what Nabil asks:", ...turns.map((t, i) => `${i + 1}. ${t}`)].join("\n");
  return { ...scn, caller: { mode: "llm", persona: "the same caller as the original call — same order, same manner of speaking", goal, noise: "none", maxTurns: Math.max(30, turns.length * 2 + 6) } };
}

const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

function printReport(r: ScenarioReport) {
  console.log(`\n── run ${r.run}: ${r.pass ? "PASS ✅" : "FAIL ❌"} · placed ${r.placed ? "yes" : "no"} · ${r.turns.length} turns · $${(r.costCents / 100).toFixed(2)} · ${(r.durationMs / 1000).toFixed(1)}s`);
  for (const reason of r.reasons) console.log(`   ✗ ${reason}`);
  console.log(`   cart diff: ${r.cartDiff.exact ? "exact match" : ""}`);
  if (!r.cartDiff.exact) for (const h of r.cartDiff.humanSummary.slice(0, 20)) console.log(`     - ${h}`);
  console.log("   tool sequence:");
  for (const t of r.turns) {
    const tools = t.toolCalls.length ? t.toolCalls.map((c) => `${c.name}${c.ok ? "" : `✗${c.code ? `(${c.code})` : ""}`}`).join(" → ") : "(none)";
    console.log(`     t${t.idx}${typeof t.scriptIndex === "number" ? `/s${t.scriptIndex}` : ""} ${pad(t.caller.slice(0, 48), 48)} ${tools}${t.clarified ? "  [clarified]" : ""}`);
  }
}

/* ─────────────────────────────── main ──────────────────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = resolve(process.cwd(), args.file);
  const input = loadScenarioFile(file);
  const slug = args.restaurant ?? input.restaurant;
  const snapshot = loadFixture(slug);

  console.log(`Replay ${input.id} — ${input.title}`);
  console.log(`  file: ${file}`);
  console.log(`  fixture: ${slug} (menuHash ${snapshot.menuHash}, captured ${snapshot.capturedAt})`);
  if (typeof input.menuSnapshotHash === "string" && input.menuSnapshotHash) {
    if (input.menuSnapshotHash !== snapshot.menuHash) {
      console.warn(`\n🚨 MENU DRIFT: the call ran on menu ${input.menuSnapshotHash} but the fixture is ${snapshot.menuHash}. Ids, prices and options may differ — a divergent replay may be the menu, not the agent. Re-snapshot with scripts/nabil-snapshot-menu.ts ${slug} to compare like with like. Continuing.\n`);
    } else console.log(`  menu hash matches the call (${input.menuSnapshotHash})`);
  } else console.log(`  (no menuSnapshotHash in the file — drift check skipped)`);

  const { scenario: cleaned, notes } = sanitizeExpected(input, snapshot);
  if (notes.length) {
    console.log(`  expected-cart adjustments (${notes.length}):`);
    for (const n of notes) console.log(`   - ${n}`);
  }
  const scenario = args.caller === "llm" ? toLlmCaller(cleaned, snapshot) : cleaned;
  const turns = scenario.caller.mode === "script" ? scenario.caller.turns.length : `≤${scenario.caller.maxTurns ?? 30}`;
  console.log(`  caller: ${scenario.caller.mode} (${turns} turns) · runs: ${args.repeat} · expected lines: ${scenario.expected.cart.lines.length} · mustPlace: ${scenario.expected.mustPlace}`);
  if (scenario.caller.mode === "script" && !scenario.caller.answers) {
    console.log("  (no standing answers in the file — Nabil's own questions get the next scripted turn; the exhausted-script rule answers the rest)");
  }
  if (args.dry) {
    console.log("\n--dry: no API calls made.");
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set (checked .env.local, .env, environment). Use --dry to check the file without it.");
    process.exit(2);
  }
  ensureSimEnv();
  const { default: Anthropic } = (await import("@anthropic-ai/sdk")) as unknown as { default: new (o: { apiKey: string }) => AnthropicLike };
  const anthropic = new Anthropic({ apiKey });

  const reports: ScenarioReport[] = [];
  for (let run = 1; run <= args.repeat; run++) {
    console.log(`\n▶ run ${run}/${args.repeat} …`);
    const log = args.verbose ? (line: string) => console.log(`[${run}]${line}`) : undefined;
    const r = await runScenario(scenario, { anthropic, snapshot, run, model: args.model ?? undefined, callerModel: args.callerModel ?? DEFAULT_CALLER_MODEL, timeoutPerTurnMs: args.timeoutMs, log });
    printReport(r);
    reports.push(r);
  }
  const metrics = computeMetrics(reports);
  const name = `${basename(file, extname(file))}.replay`;
  const paths = writeReport(dirname(file), name, { reports, metrics, args: { ...args, file, fixture: slug, menuSnapshotHash: input.menuSnapshotHash ?? null, fixtureMenuHash: snapshot.menuHash, adjustments: notes }, scenarios: [scenario], generatedAt: new Date().toISOString() });
  console.log(`\n${reports.filter((r) => r.pass).length}/${reports.length} passed · exact cart ${(metrics.exactCartAccuracy * 100).toFixed(0)}% · $${(metrics.totalCostCents / 100).toFixed(2)}`);
  console.log(`report: ${paths.md}\n        ${paths.json}`);
  process.exit(reports.every((r) => r.pass) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
