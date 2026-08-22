/**
 * Phase D — run the LLM judge over pending evaluations from a laptop (what
 * the voice-evaluate cron does), and print what it decided. Costs real money
 * (≈ US$0.05 per engaged call) — keep --cap small.
 *
 *   npx tsx scripts/nabil-judge-run.ts --db prod --cap 3
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const db = opt("--db", "dev");
const cap = Number(opt("--cap", "3"));

function urlFromEnvLocal(prod: boolean): string {
  const env = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of env.split(/\r?\n/)) {
    const m = prod ? line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/) : line.match(/^\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) url = m[1];
  }
  if (!url) throw new Error(`No ${prod ? "commented-out production" : "active"} DATABASE_URL in .env.local`);
  return url;
}
function anthropicKey(): string | null {
  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^\s*ANTHROPIC_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  return m ? m[1] : null;
}

async function main() {
  process.env.DATABASE_URL = urlFromEnvLocal(db === "prod");
  process.env.ANTHROPIC_API_KEY ||= anthropicKey() ?? "";
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  const { default: prisma } = await import("../src/lib/db");
  const { judgePendingCalls } = await import("../src/lib/voice/eval/judge");
  const r = await judgePendingCalls({ cap, budgetMs: 120_000 });
  console.log(`db=${db} cap=${cap} →`, r);
  const rows = await prisma.voiceCallEvaluation.findMany({
    where: { judgedAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    select: { callId: true, detScore: true, judgeScore: true, judgeStatus: true, judgeCostCents: true, judgeModel: true, reviewReasons: true, judgeFindings: true, call: { select: { outcome: true, durationSeconds: true } } },
    orderBy: { judgedAt: "desc" },
    take: cap,
  });
  for (const row of rows) {
    const jf = (row.judgeFindings ?? {}) as { callerGoal?: string; goalAchieved?: boolean; confidence?: number; axes?: Record<string, number>; issues?: Array<{ severity: string; category: string; description: string; turn?: number }> };
    console.log(`\n${row.callId} ${row.call.outcome} ${row.call.durationSeconds}s det=${row.detScore} judge=${row.judgeScore} (${row.judgeStatus}, ${row.judgeCostCents}¢, ${row.judgeModel})`);
    console.log(`  goal: ${jf.callerGoal ?? "—"} · achieved=${jf.goalAchieved} · conf=${jf.confidence}`);
    console.log(`  axes: ${JSON.stringify(jf.axes)}`);
    for (const i of jf.issues ?? []) console.log(`  - [${i.severity}] ${i.category}${i.turn != null ? ` @${i.turn}` : ""}: ${i.description}`);
    console.log(`  review: ${JSON.stringify(row.reviewReasons)}`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
