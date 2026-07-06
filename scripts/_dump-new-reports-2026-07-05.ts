/** Dump the 4 NEW reseller reports (2026-07-05) in full — body + attachments + comments.
 *   npx tsx scripts/run-on-prod.ts scripts/_dump-new-reports-2026-07-05.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const IDS = [
  "cmr803ovq000504l28i0t104w", // Dishes / Categories available for individual service
  "cmr809iu8000a04l25b8qqiz9", // expand/collapse in Menu Management
  "cmr80joh0000e04l2qb3mzt97", // "Pin to top" dish / category (highlight it)
  "cmr80t9rk000304jslfwbu6tn", // Meal Bundle Promo
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  for (const id of IDS) {
    const r: any = await prisma.resellerReport.findUnique({ where: { id } });
    if (!r) { console.log(`\n######## ${id} NOT FOUND`); continue; }
    console.log(`\n######## [${r.status}] ${r.title}  (id=${id})`);
    for (const k of Object.keys(r)) {
      const v = r[k];
      if (v == null || ["id", "title", "status"].includes(k)) continue;
      const s = typeof v === "string" ? v : JSON.stringify(v);
      if (s.length > 1) console.log(`  [${k}] ${s.slice(0, 3000)}`);
    }
    const comments = await prisma.resellerReportComment.findMany({ where: { reportId: id }, orderBy: { createdAt: "asc" } });
    for (const c of comments as any[]) console.log(`  COMMENT [${c.authorName}]: ${c.body}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
