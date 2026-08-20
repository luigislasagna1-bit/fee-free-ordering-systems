/** READ-ONLY prod inspection: the most recent VoiceCall for Luigi's store —
 *  transcript, per-turn latency/filler/cache numbers, versions, ack_stripped
 *  events — to grade the 2026-08-20 quality-sprint deploy against a live call.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_investigate-last-call.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const call = await prisma.voiceCall.findFirst({
    where: { restaurant: { slug: "luigis-lasagna-pizzeria" } },
    orderBy: { startedAt: "desc" },
    select: {
      id: true, callSid: true, fromNumber: true, startedAt: true, endedAt: true,
      durationSeconds: true, outcome: true, orderNumber: true, summary: true,
      language: true, transcript: true,
    },
  });
  if (!call) { console.log("No calls found."); return; }

  console.log(`CALL ${call.id}  started=${call.startedAt.toISOString()}  dur=${call.durationSeconds}s  outcome=${call.outcome}  order=${call.orderNumber ?? "-"}  lang=${call.language ?? "-"}  from=…${call.fromNumber.slice(-4)}`);
  console.log(`SUMMARY: ${call.summary ?? "(none)"}\n`);

  const events = await prisma.voiceCallEvent.findMany({
    where: { callId: call.id },
    orderBy: { seq: "asc" },
    select: { seq: true, ts: true, turn: true, type: true, payload: true, latencyMs: true },
  });
  console.log(`EVENTS: ${events.length}`);

  for (const e of events) {
    const p = (e.payload ?? {}) as any;
    if (e.type === "call_start") {
      const v = p.versions ?? {};
      console.log(`\n[call_start] agent=${v.agentVersion} model=${v.model} effort=${v.modelConfig?.effort} thinking=${v.modelConfig?.thinking} stableHash=${v.systemStableHash} menu=${v.menuSnapshotHash}`);
    } else if (e.type === "asr") {
      console.log(`\nT${e.turn} CALLER: ${p.text}`);
    } else if (e.type === "filler") {
      console.log(`   [filler ${p.kind ?? "tool"} after ${p.afterMs}ms] "${p.phrase}"`);
    } else if (e.type === "ack_stripped") {
      console.log(`   [ack_stripped] dropped "${p.dropped}"`);
    } else if (e.type === "model_text") {
      console.log(`   NABIL${p.interrupted ? " (interrupted)" : ""}: ${p.text}`);
    } else if (e.type === "tool_use") {
      console.log(`   [tool ${p.name}]`);
    } else if (e.type === "cache_miss") {
      console.log(`   [CACHE MISS] request=${p.request} uncached=${p.uncached}`);
    } else if (e.type === "turn") {
      const hops = Array.isArray(p.hops) ? p.hops : [];
      const hopStr = hops
        .map((h: any) => {
          const tin = n(h.tokensIn) ?? 0;
          const cr = n(h.cacheRead) ?? 0;
          const pct = tin > 0 ? Math.round((cr / tin) * 100) : 0;
          return `h${h.hop}:ttft=${h.ttftMs ?? "-"}ms cache=${pct}%(${cr}/${tin})`;
        })
        .join("  ");
      console.log(`   [turn ${e.turn}] firstAudio=${e.latencyMs}ms  ${hopStr}${p.filler ? `  filler="${p.filler.phrase}"` : ""}${p.interrupted ? "  INTERRUPTED" : ""}`);
    } else if (e.type === "call_end") {
      const u = p.usage ?? {};
      const lat = p.latency ?? {};
      const tin = n(u.tokensIn) ?? 0;
      const cr = n(u.cacheRead) ?? 0;
      console.log(`\n[call_end] outcome=${p.outcome}  cache overall=${tin > 0 ? Math.round((cr / tin) * 100) : 0}% (${cr}/${tin})  fillers=${lat.fillers ?? "?"}  ttfa p50/p95=${lat.ttfaP50 ?? "?"}/${lat.ttfaP95 ?? "?"}ms  latency=${JSON.stringify(lat).slice(0, 300)}`);
    } else if (e.type === "error" || e.type === "hallucination_suspect" || e.type === "narration_dropped") {
      console.log(`   [${e.type}] ${JSON.stringify(p).slice(0, 200)}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
