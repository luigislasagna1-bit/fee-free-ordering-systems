import { PrismaClient } from "../src/generated/prisma/client";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

// Use --prod flag to read the commented-out (prod) DATABASE_URL from .env.local
const useProd = process.argv.includes("--prod");
let url = process.env.DATABASE_URL!;

if (useProd) {
  const envContent = readFileSync(".env.local", "utf8");
  const commentedMatch = envContent.match(
    /^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/m
  );
  if (!commentedMatch) {
    console.error("No commented-out DATABASE_URL found in .env.local");
    process.exit(1);
  }
  url = commentedMatch[1];
  console.log("Using PROD database");
}

const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
const adapter = isNeon
  ? new PrismaNeon({ connectionString: url })
  : new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  const allCount = await prisma.voiceCallReport.count();
  console.log("Total reports in DB:", allCount);
  const byStatus = await prisma.voiceCallReport.groupBy({
    by: ["status"],
    _count: true,
  });
  console.log("By status:", JSON.stringify(byStatus));

  const reports = await prisma.voiceCallReport.findMany({
    where: { status: "NEW" },
    orderBy: { createdAt: "desc" },
    include: {
      call: true,
      restaurant: { select: { id: true, name: true, slug: true } },
      comments: { orderBy: { createdAt: "asc" } },
    },
  });

  for (const r of reports) {
    console.log("\n" + "=".repeat(80));
    console.log(`REPORT: ${r.id}`);
    console.log(`  Topic:       ${r.topic}`);
    console.log(`  Status:      ${r.status}`);
    console.log(`  Description: ${r.description}`);
    console.log(`  Restaurant:  ${r.restaurant.name} (${r.restaurant.slug})`);
    console.log(`  Reporter:    ${r.reporterName} <${r.reporterEmail}>`);
    console.log(`  Created:     ${r.createdAt}`);
    console.log(`  Call ID:     ${r.call.id}`);
    console.log(`  Call SID:    ${r.call.callSid}`);
    console.log(`  Started:     ${r.call.startedAt}`);
    console.log(`  Duration:    ${r.call.durationSeconds}s`);
    console.log(`  Outcome:     ${r.call.outcome}`);
    console.log(`  Order#:      ${r.call.orderNumber ?? "(none)"}`);
    console.log(`  Sentiment:   ${r.call.sentiment}`);
    console.log(`  QuotedTotal: ${r.call.quotedTotal}`);
    console.log(`  ChargedTotal:${r.call.chargedTotal}`);
    console.log(`  Summary:     ${r.call.summary}`);
    console.log(`  Model:       ${r.call.model}`);
    console.log(
      `  Agent/Prompt/Tools: ${r.call.agentVersion}/${r.call.promptVersion}/${r.call.toolsVersion}`
    );
    console.log(`  MenuHash:    ${r.call.menuSnapshotHash}`);

    const transcript = Array.isArray(r.call.transcript)
      ? (r.call.transcript as Array<{
          role: string;
          text: string;
          ts?: number | string;
          interrupted?: boolean;
        }>)
      : [];

    console.log(`\n  TRANSCRIPT (${transcript.length} turns):`);
    for (const t of transcript) {
      const speaker = t.role === "assistant" ? "NABIL" : "CALLER";
      const flag = t.interrupted ? " [INTERRUPTED]" : "";
      console.log(`    ${speaker}: ${t.text}${flag}`);
    }
    console.log("=".repeat(80));
  }

  console.log(`\nTotal NEW reports: ${reports.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
