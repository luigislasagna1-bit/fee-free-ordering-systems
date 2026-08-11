/**
 * READ-ONLY post-deploy verification for the Nabil dashboard.
 *   npx tsx scripts/run-on-prod.ts scripts/_verify-nabil-live-2026-08-10.ts
 * Prints: legacy orderId migration state, how many calls have AI summaries /
 * sentiment / recordings, and the newest calls with their key fields.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const [total, withSummary, withSentiment, withRecording, withOrderNumber, legacyLeft] = await Promise.all([
    prisma.voiceCall.count(),
    prisma.voiceCall.count({ where: { summary: { not: null } } }),
    prisma.voiceCall.count({ where: { sentiment: { not: null } } }),
    prisma.voiceCall.count({ where: { recordingUrl: { not: null } } }),
    prisma.voiceCall.count({ where: { orderNumber: { not: null } } }),
    prisma.voiceCall.count({ where: { orderId: { startsWith: "ORD-" } } }),
  ]);
  console.log(
    `calls=${total} summary=${withSummary} sentiment=${withSentiment} recording=${withRecording} orderNumber=${withOrderNumber} legacyOrderIdLeft=${legacyLeft}`,
  );

  const recent = await prisma.voiceCall.findMany({
    orderBy: { startedAt: "desc" },
    take: 6,
    select: {
      callSid: true, startedAt: true, endedAt: true, durationSeconds: true, outcome: true,
      orderNumber: true, orderId: true, sentiment: true, recordingSid: true, costCents: true,
      summary: true,
    },
  });
  for (const c of recent) {
    console.log(
      `\n${c.callSid} ${c.outcome ?? "-"} dur=${c.durationSeconds ?? "-"}s order=${c.orderNumber ?? "-"} ` +
        `sentiment=${c.sentiment ?? "-"} rec=${c.recordingSid ? "yes" : "no"} cost=${c.costCents ?? "-"}c\n` +
        `  started=${c.startedAt.toISOString()} ended=${c.endedAt?.toISOString() ?? "-"}\n` +
        `  summary: ${c.summary ? c.summary.slice(0, 160) : "(none)"}`,
    );
  }

  // startedAt used to equal endedAt (row created at hangup). Post-fix rows have
  // a real start, so the gap should be ~= durationSeconds.
  const gaps = recent
    .filter((c) => c.endedAt && c.durationSeconds != null)
    .map((c) => Math.round((c.endedAt!.getTime() - c.startedAt.getTime()) / 1000));
  console.log(`\nstart→end gaps (s): ${gaps.join(", ")}  (0 = legacy row, ≈duration = new call-start event working)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
