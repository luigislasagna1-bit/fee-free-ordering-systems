/** Print one reseller report's full description + comments by id.
 *   npx tsx scripts/run-on-prod.ts scripts/_dump-report.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const ID = "cmrldhwep00000ahurwghiksj";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const r: any = await prisma.resellerReport.findUnique({ where: { id: ID } });
  if (!r) { console.log("not found"); await prisma.$disconnect(); return; }
  console.log("TITLE:", r.title);
  console.log("STATUS:", r.status, " by:", r.reportedByName ?? r.authorName);
  // Print every field so we find whichever one holds the body text + the image.
  for (const k of Object.keys(r)) {
    const v = r[k];
    if (v == null) continue;
    const s = typeof v === "string" ? v : JSON.stringify(v);
    if (s.length > 1) console.log(`\n[${k}]\n${s.slice(0, 1500)}`);
  }
  const comments = await prisma.resellerReportComment.findMany({ where: { reportId: ID }, orderBy: { createdAt: "asc" } });
  console.log(`\n=== COMMENTS (${comments.length}) ===`);
  for (const c of comments as any[]) console.log(`- [${c.authorName}] ${c.body}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
