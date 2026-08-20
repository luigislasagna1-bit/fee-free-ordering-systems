import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function connectionString(): string {
  const env = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls[1] ?? urls[0];
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: connectionString() }),
  } as never);

  const calls = await prisma.voiceCall.findMany({
    where: {
      restaurantId: "cmp7xhd3900000al2jz0db5vi",
      startedAt: { gte: new Date("2026-08-18T20:00:00-04:00") },
    },
    select: {
      id: true,
      callSid: true,
      fromNumber: true,
      toNumber: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      outcome: true,
      transferReason: true,
      summary: true,
      model: true,
      agentVersion: true,
      promptVersion: true,
      toolsVersion: true,
      menuSnapshotHash: true,
      tokensIn: true,
      tokensOut: true,
      costCents: true,
      eventCount: true,
      sentiment: true,
      transcript: true,
    },
    orderBy: { startedAt: "desc" },
    take: 15,
  });

  console.log(`=== Recent calls (${calls.length}) ===\n`);
  for (const c of calls) {
    const transcript = c.transcript as any[];
    const transcriptLen = Array.isArray(transcript) ? transcript.length : 0;
    console.log(
      `${c.startedAt?.toISOString()} | ${c.outcome ?? "?"} | ${c.durationSeconds ?? 0}s | tokens=${c.tokensIn ?? 0}/${c.tokensOut ?? 0} | cost=${c.costCents ?? 0}¢ | events=${c.eventCount ?? 0} | transcript=${transcriptLen} | agent=${c.agentVersion ?? "?"} | prompt=${c.promptVersion?.slice(0, 8) ?? "?"} | menu=${c.menuSnapshotHash?.slice(0, 8) ?? "none"}`
    );
    if (c.transferReason) console.log(`  transfer: ${c.transferReason}`);
    if (c.summary) console.log(`  summary: ${c.summary.slice(0, 150)}`);
    if (Array.isArray(transcript) && transcript.length > 0) {
      console.log(`  first transcript entry: ${JSON.stringify(transcript[0]).slice(0, 200)}`);
    }
    console.log();
  }

  await prisma.$disconnect();
}
main().catch(console.error);
