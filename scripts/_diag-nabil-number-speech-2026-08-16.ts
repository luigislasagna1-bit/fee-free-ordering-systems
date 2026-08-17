/**
 * READ-ONLY diag (2026-08-16 evening): Luigi's report after the A62 test call —
 * "sometimes when saying numbers (double digits or more) the ai system says it
 * incorrectly, especially for the address". Dump the last N hours of calls on
 * prod with transcripts + the timeline events that carry spoken text, address
 * text, or number verbalisation, plus any VoiceCallReport filed today.
 *
 *   npx tsx scripts/_diag-nabil-number-speech-2026-08-16.ts [hours=4]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" });

function prodUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) url = m[1];
  }
  if (!url) throw new Error("no prod url");
  return url;
}

const HOURS = Number(process.argv[2] ?? 4);

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl() }) } as any);
  const since = new Date(Date.now() - HOURS * 3600_000);
  const calls = await prisma.voiceCall.findMany({
    where: { startedAt: { gte: since } },
    orderBy: { startedAt: "desc" },
    take: 8,
    select: {
      id: true, restaurantId: true, startedAt: true, endedAt: true, durationSeconds: true, outcome: true,
      orderNumber: true, transcript: true, summary: true,
    },
  });
  console.log(`now=${new Date().toISOString()} calls in last ${HOURS}h: ${calls.length}`);
  for (const c of calls) {
    console.log("\n" + "=".repeat(100));
    console.log(`CALL ${c.id} started=${c.startedAt.toISOString()} dur=${c.durationSeconds ?? "—"}s outcome=${c.outcome ?? "—"} order=${c.orderNumber ?? "—"}`);
    console.log(`summary: ${c.summary ?? "—"}`);
    const t = (c.transcript as any[] | null) ?? [];
    console.log(`--- transcript (${t.length} turns) ---`);
    for (const turn of t) {
      const role = String(turn.role ?? "?").padEnd(9);
      console.log(`  ${role} ${String(turn.text ?? "").replace(/\s+/g, " ")}`);
    }
    // Timeline events: anything mentioning address / number verbalisation / TTS text
    const events = await prisma.voiceCallEvent.findMany({
      where: { callId: c.id },
      orderBy: { seq: "asc" },
      select: { seq: true, ts: true, turn: true, type: true, payload: true, latencyMs: true },
    });
    console.log(`--- timeline: ${events.length} events; types: ${[...new Set(events.map((e) => e.type))].join(", ")} ---`);
    for (const e of events) {
      const p = JSON.stringify(e.payload);
      const interesting =
        /address|street|spell|digit|number|house|verbal|spoken|say|readback|read_back|tts|assistant_said|reply|fulfil|delivery|postal|zip|unit/i.test(e.type + " " + p);
      if (!interesting) continue;
      console.log(`  #${String(e.seq).padStart(3)} t${e.turn ?? "-"} ${e.type.padEnd(28)} ${p.length > 900 ? p.slice(0, 900) + "…" : p}`);
    }
  }
  const reports = await prisma.voiceCallReport.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  console.log("\n" + "=".repeat(100));
  console.log(`VoiceCallReports in last ${HOURS}h: ${reports.length}`);
  for (const r of reports) {
    console.log(`  ${r.id} call=${r.callId} topic=${r.topic} urgent=${r.urgent} status=${r.status} reporter=${r.reporterEmail ?? "—"} created=${r.createdAt.toISOString()}`);
    console.log(`    description: ${r.description}`);
    console.log(`    resolution: ${r.resolution ?? "—"}  comments=${r.comments.length}`);
    for (const cm of r.comments) console.log(`      - [${(cm as any).authorRole ?? (cm as any).author ?? "?"}] ${(cm as any).body ?? (cm as any).text ?? JSON.stringify(cm)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
