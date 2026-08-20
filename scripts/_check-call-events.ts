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

  // Get a recent broken call
  const call = await prisma.voiceCall.findFirst({
    where: {
      restaurantId: "cmp7xhd3900000al2jz0db5vi",
      startedAt: { gte: new Date("2026-08-19T02:15:00Z") },
      durationSeconds: 0,
    },
    select: { id: true, callSid: true, startedAt: true },
    orderBy: { startedAt: "desc" },
  });

  if (!call) {
    console.log("No broken calls found");
    await prisma.$disconnect();
    return;
  }

  console.log(`=== Events for ${call.callSid} (${call.startedAt?.toISOString()}) ===`);

  const events = await prisma.voiceCallEvent.findMany({
    where: { callId: call.id },
    orderBy: { seq: "asc" },
  });

  console.log(`Found ${events.length} events`);
  for (const e of events) {
    console.log(`#${e.seq} | ${JSON.stringify(e.payload).slice(0, 500)}`);
  }

  // Also check: does the call have a callSid? Get Twilio info.
  console.log(`\nCallSid: ${call.callSid}`);

  // Check the LAST good call too for comparison
  const goodCall = await prisma.voiceCall.findFirst({
    where: {
      restaurantId: "cmp7xhd3900000al2jz0db5vi",
      startedAt: { gte: new Date("2026-08-19T00:00:00Z") },
      durationSeconds: { gt: 0 },
    },
    select: { id: true, callSid: true, startedAt: true },
    orderBy: { startedAt: "desc" },
  });

  if (goodCall) {
    console.log(`\n=== Events for GOOD call ${goodCall.callSid} (${goodCall.startedAt?.toISOString()}) ===`);
    const goodEvents = await prisma.voiceCallEvent.findMany({
      where: { callId: goodCall.id },
      orderBy: { seq: "asc" },
      take: 5,
    });
    for (const e of goodEvents) {
      console.log(`#${e.seq} | ${JSON.stringify(e.payload).slice(0, 500)}`);
    }
  }

  await prisma.$disconnect();
}
main().catch(console.error);
