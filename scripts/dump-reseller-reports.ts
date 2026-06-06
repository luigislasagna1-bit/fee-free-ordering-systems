/**
 * Dump reseller reports that still need attention (NEW / IN_PROGRESS /
 * IN_TESTING) with their full body + all comments, so we can triage + fix.
 *   npx tsx scripts/run-on-prod.ts scripts/dump-reseller-reports.ts
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

  const reports = await prisma.resellerReport.findMany({
    where: { status: { in: ["NEW", "IN_PROGRESS", "IN_TESTING"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });

  console.log(`\n===== ${reports.length} open reports (NEW / IN_PROGRESS / IN_TESTING) =====\n`);
  for (const r of reports) {
    console.log("──────────────────────────────────────────────────────────────");
    console.log(`[${r.status}] (${r.type}/${r.priority}) #${r.id}`);
    console.log(`TITLE: ${r.title}`);
    console.log(`BY: ${r.authorName} <${r.authorEmail}>  •  ${r.createdAt.toISOString().slice(0, 10)}`);
    console.log(`BODY:\n${r.body}`);
    const imgs = r.imageUrls && r.imageUrls !== "[]" ? r.imageUrls : null;
    if (imgs) console.log(`IMAGES: ${imgs}`);
    if (r.comments.length) {
      console.log(`COMMENTS (${r.comments.length}):`);
      for (const c of r.comments) {
        console.log(`  • ${c.authorName} <${c.authorEmail}> ${c.createdAt.toISOString().slice(0, 16)}: ${c.body}`);
      }
    } else {
      console.log("COMMENTS: (none)");
    }
    console.log("");
  }

  // Status summary across ALL reports for context.
  const all = await prisma.resellerReport.groupBy({ by: ["status"], _count: true });
  console.log("Status counts (all reports):", all.map((a) => `${a.status}=${a._count}`).join("  "));

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
