/**
 * MODEL-CONFIG BENCHMARK for the Nabil turn loop (directive §34/§35: decide by
 * data, not familiarity).
 *
 *   npx tsx scripts/nabil-bench.ts [--suite critical] [--ids T01,T03,T07] [--repeat 1]
 *                                  [--configs adaptive,off,haiku-off]
 *
 * Runs the same scenarios under each configuration and prints one table:
 * pass rate, exact cart, hallucination rate, TTFA p50/p95, cost. Each config
 * is a separate `nabil-sim` process because CONFIG (thinking / model) is read
 * at import time in the voice service.
 *
 *   adaptive   = claude-sonnet-5, thinking adaptive + effort low (today's prod)
 *   off        = claude-sonnet-5, thinking disabled
 *   haiku-off  = claude-haiku-4-5, thinking disabled (latency reference only —
 *                a mid-call model switch is not on the table)
 *   opus-off   = claude-opus-5, thinking disabled (Luigi 2026-08-15: accuracy
 *                first, then latency, then cost — if Opus is measurably more
 *                accurate on the hard ids it is allowed to cost more)
 *   opus-adaptive = claude-opus-5, adaptive thinking (effort low)
 */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const suite = opt("--suite", "critical");
const ids = opt("--ids", "");
const repeat = opt("--repeat", "1");
const configs = opt("--configs", "adaptive,off").split(",").map((s) => s.trim()).filter(Boolean);
const outRoot = join(process.cwd(), "reports", "nabil-sim", "generated", "bench");
mkdirSync(outRoot, { recursive: true });

const CONFIGS: Record<string, { env: Record<string, string>; model?: string }> = {
  adaptive: { env: { NABIL_THINKING: "adaptive" } },
  off: { env: { NABIL_THINKING: "off", NABIL_MAX_TOKENS: "1024" } },
  "haiku-off": { env: { NABIL_THINKING: "off", NABIL_MAX_TOKENS: "1024" }, model: "claude-haiku-4-5" },
  "opus-off": { env: { NABIL_THINKING: "off", NABIL_MAX_TOKENS: "1024" }, model: "claude-opus-5" },
  /** opus-off + sentence-chunk TTS with the narration filter (drops thinking-aloud sentences before the voice). */
  "opus-off-chunk": { env: { NABIL_THINKING: "off", NABIL_MAX_TOKENS: "1024", NABIL_TTS_CHUNK: "sentence" }, model: "claude-opus-5" },
  "off-chunk": { env: { NABIL_THINKING: "off", NABIL_MAX_TOKENS: "1024", NABIL_TTS_CHUNK: "sentence" } },
  "opus-adaptive": { env: { NABIL_THINKING: "adaptive" }, model: "claude-opus-5" },
};

type Row = { config: string; passRate: number; exact: number; halluc: number; robotic: number; ttfaP50: number | null; ttfaP95: number | null; costCents: number; cpm: number; failed: string[] };
const rows: Row[] = [];
for (const c of configs) {
  const cfg = CONFIGS[c];
  if (!cfg) {
    console.error(`unknown config ${c}`);
    continue;
  }
  const out = join(outRoot, c);
  mkdirSync(out, { recursive: true });
  const cmd = ["tsx", "scripts/nabil-sim.ts", "--suite", suite, "--repeat", repeat, "--out", out, ...(ids ? ["--ids", ids] : []), ...(cfg.model ? ["--model", cfg.model] : [])];
  console.log(`\n━━━ ${c}: ${JSON.stringify(cfg.env)} ${cfg.model ?? ""}`);
  spawnSync("npx", cmd, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, ...cfg.env } });
  const files = readdirSync(out).filter((f) => f.endsWith(".json")).sort();
  const latest = files[files.length - 1];
  if (!latest) {
    console.error(`no report for ${c}`);
    continue;
  }
  const j = JSON.parse(readFileSync(join(out, latest), "utf8"));
  const m = j.metrics ?? {};
  rows.push({ config: c, passRate: m.passRate ?? 0, exact: m.exactCartAccuracy ?? 0, halluc: m.hallucinationRate ?? 0, robotic: m.roboticUtteranceRate ?? 0, ttfaP50: m.ttftP50 ?? null, ttfaP95: m.ttftP95 ?? null, costCents: m.totalCostCents ?? 0, cpm: m.modelCentsPerEstMinute ?? 0, failed: m.failedIds ?? [] });
}
console.log("\n━━━ BENCH RESULTS");
console.log("config         pass    exact   halluc  robotic ttfa p50  ttfa p95  cost     ¢/est-min");
for (const r of rows) {
  const p = (x: number) => `${(x * 100).toFixed(0)}%`.padEnd(7);
  console.log(`${r.config.padEnd(14)} ${p(r.passRate)} ${p(r.exact)} ${p(r.halluc)} ${p(r.robotic)} ${String(r.ttfaP50 ?? "–").padEnd(9)} ${String(r.ttfaP95 ?? "–").padEnd(9)} $${(r.costCents / 100).toFixed(2).padEnd(7)} ${r.cpm.toFixed(1)}¢${r.failed.length ? `  failed: ${r.failed.join(",")}` : ""}`);
}
console.log("\nDecision rule (Luigi 2026-08-15): the most ACCURATE config wins (pass rate, then exact cart); ties break on TTFA p95, then cost. Set NABIL_THINKING / NABIL_MAX_TOKENS / NABIL_MODEL on Fly accordingly.");
