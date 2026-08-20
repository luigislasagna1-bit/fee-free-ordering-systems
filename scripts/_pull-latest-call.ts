import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
  console.log("Connecting to:", url.replace(/:[^:@]+@/, ":****@").split("/")[2]);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);

  // List 5 most recent calls
  const calls = await prisma.voiceCall.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true, fromNumber: true, toNumber: true, createdAt: true,
      durationSeconds: true, outcome: true, summary: true,
    },
  });

  console.log("\n=== 5 MOST RECENT CALLS ===");
  for (const c of calls) {
    console.log(`${c.createdAt} | ${c.fromNumber} -> ${c.toNumber} | ${c.durationSeconds}s | ${c.outcome}`);
    if (c.summary) console.log(`  ${c.summary}`);
  }

  const count = await prisma.voiceCall.count();
  console.log(`\nTotal calls in DB: ${count}`);

  // Get full transcript of the latest call
  const call = await prisma.voiceCall.findFirst({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, fromNumber: true, toNumber: true, createdAt: true,
      durationSeconds: true, outcome: true, summary: true, sentiment: true,
      model: true, tokensIn: true, tokensOut: true, costCents: true,
      transcript: true, recordingUrl: true, latency: true,
    },
  });

  if (call) {
    console.log("\n=== LATEST CALL DETAILS ===");
    console.log("From:", call.fromNumber);
    console.log("To:", call.toNumber);
    console.log("When:", call.createdAt);
    console.log("Duration:", call.durationSeconds, "s");
    console.log("Outcome:", call.outcome);
    console.log("Sentiment:", call.sentiment);
    console.log("Summary:", call.summary);
    console.log("Tokens:", call.tokensIn, "in /", call.tokensOut, "out");
    console.log("Cost:", call.costCents, "cents");
    console.log("Recording:", call.recordingUrl ? "YES" : "NO");
    const lat = call.latency as any;
    if (lat) console.log("Latency:", JSON.stringify(lat, null, 2));
    console.log();
    console.log("=== TRANSCRIPT ===");
    type Turn = { role?: string; text?: string };
    const t = (call.transcript as Turn[]) || [];
    for (const turn of t) {
      const role = (turn.role || "?").toUpperCase().padEnd(12);
      console.log(`${role} ${turn.text || ""}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
