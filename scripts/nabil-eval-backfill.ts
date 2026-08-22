/**
 * Phase D — run the deterministic evaluator over stored calls and print what
 * it found (validating the detectors on REAL data before anyone trusts a
 * dashboard built on them).
 *
 *   npx tsx scripts/nabil-eval-backfill.ts --db prod --hours 72 --cap 200
 *   npx tsx scripts/nabil-eval-backfill.ts --db prod --hours 72 --all   # re-evaluate even already-scored calls
 *
 * --db prod reads the commented-out production DATABASE_URL from .env.local
 * (same convention as scripts/_read-recent-nabil-calls-2026-08-16.ts) and
 * sets it BEFORE the shared Prisma client loads. Writes only the
 * VoiceCallEvaluation side table (additive, idempotent — what the cron does).
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const flag = (n: string) => args.includes(n);
const db = opt("--db", "dev");
const hours = Number(opt("--hours", "72"));
const cap = Number(opt("--cap", "200"));
const all = flag("--all");

function prodUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) url = m[1];
  }
  if (!url) throw new Error("No commented-out production DATABASE_URL in .env.local");
  return url;
}

function devUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  }
  throw new Error("No active DATABASE_URL in .env.local");
}

async function main() {
  // tsx does not load .env.local — pick the branch explicitly.
  process.env.DATABASE_URL = db === "prod" ? prodUrl() : process.env.DATABASE_URL || devUrl();
  const { default: prisma } = await import("../src/lib/db");
  const { evaluateMissingCalls, evaluateStoredCall } = await import("../src/lib/voice/eval/evaluate-call");

  const since = new Date(Date.now() - hours * 3600_000);
  let evaluated = 0;
  if (all) {
    const rows = await prisma.voiceCall.findMany({ where: { endedAt: { not: null, gte: since } }, select: { id: true }, orderBy: { endedAt: "asc" }, take: cap });
    for (const r of rows) {
      try {
        if (await evaluateStoredCall(r.id)) evaluated++;
      } catch (e) {
        console.error("failed", r.id, e);
      }
    }
  } else {
    for (let round = 0; round < 20; round++) {
      const r = await evaluateMissingCalls({ hours, cap: Math.min(50, cap - evaluated) });
      evaluated += r.evaluated;
      if (r.evaluated === 0 || evaluated >= cap) break;
    }
  }
  console.log(`db=${db} window=${hours}h evaluated=${evaluated}`);

  const rows = await prisma.voiceCallEvaluation.findMany({
    where: { evaluatedAt: { gte: new Date(Date.now() - 10 * 60_000) }, call: { endedAt: { gte: since } } },
    select: { callId: true, detScore: true, failureClass: true, abandonClass: true, needsReview: true, reviewReasons: true, findings: true, deadAirTurns: true, toolErrors: true, clarifications: true, transferStuck: true, totalsMismatch: true, channel: true, call: { select: { outcome: true, startedAt: true, durationSeconds: true, orderNumber: true } } },
    orderBy: { evaluatedAt: "desc" },
    take: cap,
  });
  const scored = rows.filter((r) => r.detScore !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, r) => a + (r.detScore ?? 0), 0) / scored.length) : null;
  const count = (f: (r: (typeof rows)[number]) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = f(r) ?? "—";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" ");
  };
  const findingCounts = new Map<string, number>();
  for (const r of rows) for (const f of (r.findings as Array<{ code: string }>) ?? []) findingCounts.set(f.code, (findingCounts.get(f.code) ?? 0) + 1);
  console.log(`rows=${rows.length} scored=${scored.length} avgDet=${avg ?? "—"} needsReview=${rows.filter((r) => r.needsReview).length}`);
  console.log(`outcomes: ${count((r) => r.call.outcome)}`);
  console.log(`abandonClass: ${count((r) => r.abandonClass)}`);
  console.log(`failureClass: ${count((r) => r.failureClass)}`);
  console.log(`channel: ${count((r) => r.channel)}`);
  console.log(`findings: ${[...findingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`deadAirTurns total=${rows.reduce((a, r) => a + r.deadAirTurns, 0)} transferStuck=${rows.filter((r) => r.transferStuck).length} totalsMismatch=${rows.filter((r) => r.totalsMismatch).length}`);
  console.log("\nlowest scores:");
  for (const r of [...scored].sort((a, b) => (a.detScore ?? 0) - (b.detScore ?? 0)).slice(0, 8)) {
    const top = ((r.findings as Array<{ code: string }>) ?? []).slice(0, 3).map((f) => f.code).join(",");
    console.log(`  ${r.detScore}  ${r.call.outcome ?? "—"}  ${r.abandonClass ?? ""}  ${r.call.startedAt.toISOString().slice(0, 16)}  ${r.call.durationSeconds ?? "?"}s  ${top}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
