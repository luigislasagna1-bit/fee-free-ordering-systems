/**
 * NABIL CAPACITY — what does one concurrent call actually cost in memory?
 *
 * WHY THIS EXISTS (2026-08-15). `hard_limit = 25` in services/nabil-voice/fly.toml
 * is a number somebody typed, not a number anybody measured, and the machine it
 * runs on has 512 MB. "Multi-line, no busy signals" is the competitor's loudest
 * claim and we cannot honestly make it while the ceiling is a guess — so measure
 * it, write the answer into fly.toml, and set hard_limit from evidence.
 *
 * Every concurrent call holds its OWN copy of: the menu payload, a built
 * MenuIndex, the composed system prompt (the big one — it is the menu rendered
 * as text), a CartEngine, and a message history that grows until compaction. So
 * this script builds N of exactly those, all alive at once, and measures the
 * heap between each step.
 *
 * ⚠️ WHAT THIS DOES NOT MEASURE, so nobody mistakes the output for the whole
 * answer: the WebSocket/TLS buffers ws holds per connection, the Anthropic SDK's
 * per-stream state, and Node's own baseline. It is a FLOOR on per-call cost, not
 * a ceiling. The two constraints it cannot see at all are Anthropic org rate
 * limits (likelier to bite first) and CPU on a shared-cpu-1x streaming N token
 * flows at once. Treat the recommendation as "no more than", never "safe at".
 *
 * Usage:
 *   node --expose-gc --import tsx scripts/nabil-capacity.ts
 *   node --expose-gc --import tsx scripts/nabil-capacity.ts --restaurant luigis --steps 1,5,10,25,40
 *
 * Costs nothing: no Anthropic calls, no network, fixture only.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { MenuSnapshot } from "../src/lib/voice/sim/snapshot-types";
import { createFakeBackend } from "../src/lib/voice/sim/fake-backend";
import { buildMenuIndex } from "../services/nabil-voice/src/menu-index";
import { buildSystemPrompt } from "../services/nabil-voice/src/prompt";
import { normalizeAgentConfig } from "../services/nabil-voice/src/agent-config";
import { CartEngine } from "../services/nabil-voice/src/cart-engine";
import { compilerFromApi } from "../services/nabil-voice/src/compiler-port";
import { canonicalPhone } from "../services/nabil-voice/src/tools";
import type { VoiceApi } from "../services/nabil-voice/src/api";

/* ─────────────────────────────── args ──────────────────────────────────── */

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const RESTAURANT = arg("restaurant", "luigis");
const STEPS = arg("steps", "1,5,10,25,40")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => Number.isFinite(n) && n > 0)
  .sort((a, b) => a - b);

/** Fly VM size the recommendation is computed against. */
const VM_MB = parseInt(arg("vm-mb", "512"), 10);
/**
 * Node's own floor plus room for GC to breathe. A V8 heap run right to the wall
 * does not OOM cleanly — it thrashes, which on a phone line is worse than a
 * refused connection because the caller hears the silence.
 */
const BASELINE_MB = parseInt(arg("baseline-mb", "90"), 10);
const HEADROOM = 0.7;

/**
 * The message history a long call carries just before compaction fires
 * (compaction.ts: every 12 turns or ~24k estimated tokens). Modelled at the
 * ceiling on purpose — measuring a fresh session would flatter the result.
 */
const HISTORY_CHARS = parseInt(arg("history-chars", "96000"), 10);

/* ─────────────────────────────── helpers ───────────────────────────────── */

function loadFixture(slug: string): MenuSnapshot {
  const path = resolve(process.cwd(), "src/lib/voice/sim/fixtures", `${slug}.menu.json`);
  if (!existsSync(path)) {
    throw new Error(`No fixture for "${slug}" at ${path} — run scripts/nabil-snapshot-menu.ts <slug> first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as MenuSnapshot;
}

const gc: (() => void) | undefined = (globalThis as { gc?: () => void }).gc;

/** Settle the heap before reading it. Without --expose-gc the numbers are noise
 *  and the script says so rather than quietly reporting garbage. */
async function settle(): Promise<void> {
  if (!gc) return;
  for (let i = 0; i < 3; i++) {
    gc();
    await new Promise((r) => setTimeout(r, 40));
  }
}

const mb = (bytes: number) => bytes / 1024 / 1024;
const fmt = (n: number, d = 1) => n.toFixed(d);

/** One live call's worth of app-side state, held so nothing is collected. */
type SessionFootprint = {
  menuPayload: unknown;
  menu: ReturnType<typeof buildMenuIndex>;
  system: string;
  callFacts: string;
  cart: CartEngine;
  history: Array<{ role: string; content: string }>;
};

async function buildOne(snapshot: MenuSnapshot, i: number): Promise<SessionFootprint> {
  // A real call gets its own backend, its own parsed payload and its own index —
  // nothing is shared between calls, which is exactly why N of them costs N×.
  const backend = createFakeBackend(snapshot, { open: true });
  const menuPayload = await backend.menu(snapshot.slug);
  const context = await backend.context(snapshot.slug);
  const menu = buildMenuIndex(menuPayload);
  const cfg = normalizeAgentConfig({ allowPizzaCombo: true, canTakeOrders: true, canAnswerFaq: true });

  const { system, callFacts } = buildSystemPrompt({
    menu: menuPayload,
    context,
    returningCaller: null,
    cfg,
    callerPhone: `+1647555${String(1000 + i).slice(-4)}`,
  });

  const cart = new CartEngine({
    compiler: compilerFromApi(backend as unknown as VoiceApi, snapshot.slug),
    menu,
    askGroupIds: cfg.pizzaAskGroups,
    offerDeals: cfg.offerDayDeals,
    allowPizzaCombo: true,
    callerId: canonicalPhone(`+1647555${String(1000 + i).slice(-4)}`) || null,
    knownName: null,
  });

  // Distinct per session so V8 cannot intern one shared string and make the
  // measurement look better than production.
  const chunk = `turn ${i} ` + "x".repeat(400);
  const history: Array<{ role: string; content: string }> = [];
  for (let c = 0; c < Math.ceil(HISTORY_CHARS / chunk.length); c++) {
    history.push({ role: c % 2 ? "assistant" : "user", content: `${chunk}#${c}` });
  }

  return { menuPayload, menu, system, callFacts, cart, history };
}

/* ─────────────────────────────── run ───────────────────────────────────── */

async function main(): Promise<void> {
  const snapshot = loadFixture(RESTAURANT);

  console.log(`\nNABIL CAPACITY — ${RESTAURANT} fixture, VM ${VM_MB} MB`);
  if (!gc) {
    console.log(
      "⚠️  Running WITHOUT --expose-gc: the heap is not settled between steps, so these\n" +
        "    numbers are indicative at best. Re-run as:\n" +
        "      node --expose-gc --import tsx scripts/nabil-capacity.ts\n",
    );
  }

  // Warm once and throw it away, so first-call lazy init (module graphs, regex
  // compilation, the compiler's own caches) is not billed to session #1.
  await buildOne(snapshot, 0);
  await settle();

  const probe = await buildOne(snapshot, 0);
  console.log(
    `\nOne session holds: system prompt ${fmt(probe.system.length / 1024)} KB` +
      ` · menu payload ${fmt(JSON.stringify(probe.menuPayload).length / 1024)} KB` +
      ` · history modelled at ${fmt(HISTORY_CHARS / 1024)} KB\n`,
  );
  void probe;

  await settle();
  const base = process.memoryUsage();

  const held: SessionFootprint[] = [];
  const rows: Array<{ n: number; heapMb: number; rssMb: number; perMb: number }> = [];

  for (const target of STEPS) {
    while (held.length < target) held.push(await buildOne(snapshot, held.length));
    await settle();
    const now = process.memoryUsage();
    const heapMb = mb(now.heapUsed - base.heapUsed);
    const rssMb = mb(now.rss - base.rss);
    rows.push({ n: target, heapMb, rssMb, perMb: heapMb / target });
  }

  console.log("  calls |   heap Δ |    rss Δ | per call");
  console.log("  ------+----------+----------+---------");
  for (const r of rows) {
    console.log(
      `  ${String(r.n).padStart(5)} | ${(fmt(r.heapMb) + " MB").padStart(8)} | ${(fmt(r.rssMb) + " MB").padStart(8)} | ${fmt(r.perMb, 2)} MB`,
    );
  }

  // Marginal cost over the widest span measured, skipping N=1: the average over
  // small N is distorted by one-off allocations that do not repeat per call, and
  // RSS at N=1 is dominated by warm-up noise (it can even read negative).
  const first = rows.find((r) => r.n >= 5) ?? rows[0];
  const last = rows[rows.length - 1];
  const span = Math.max(1, last.n - first.n);
  const marginalHeap = rows.length > 1 ? (last.heapMb - first.heapMb) / span : last.perMb;
  // RSS is what Fly's memory limit actually counts — it includes allocator
  // fragmentation and off-heap buffers that heapUsed cannot see. Always the
  // larger of the two, so it is the one the recommendation is built on.
  const marginalRss = rows.length > 1 ? (last.rssMb - first.rssMb) / span : last.perMb;
  const marginal = Math.max(marginalHeap, marginalRss, 0.01);

  const usableMb = VM_MB * HEADROOM - BASELINE_MB;
  const ceiling = Math.max(1, Math.floor(usableMb / marginal));

  console.log(
    `\n  marginal per concurrent call: ${fmt(marginalHeap, 2)} MB heap · ${fmt(marginalRss, 2)} MB RSS` +
      `\n  using RSS (${fmt(marginal, 2)} MB) — it is what the VM's limit counts` +
      `\n  usable on a ${VM_MB} MB VM (${Math.round(HEADROOM * 100)}% of it, less a ${BASELINE_MB} MB Node baseline): ${fmt(usableMb)} MB` +
      `\n  → memory-only ceiling: ~${ceiling} concurrent calls\n`,
  );

  console.log(
    "  Read this as a FLOOR. It excludes ws/TLS buffers, the Anthropic SDK's per-stream\n" +
      "  state, and Node's baseline growth under load — and it cannot see the two limits\n" +
      "  most likely to bite first: Anthropic org rate limits, and CPU on shared-cpu-1x\n" +
      "  streaming this many token flows at once. Set fly.toml's hard_limit at or BELOW\n" +
      "  this number, and prove the rest with real simultaneous calls.\n",
  );

  // Keep every footprint reachable to the very end: if the loop's references
  // died early the measurement would be of the garbage collector, not the calls.
  console.log(`  (held ${held.length} live session footprints to the end)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
