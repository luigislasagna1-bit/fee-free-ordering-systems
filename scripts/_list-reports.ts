/** List ALL reseller reports with current status + last comment (ground-truth for the testing pass).
 *    npx tsx scripts/run-on-prod.ts scripts/_list-reports.ts
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
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, status: true, createdAt: true },
  });
  const comments = await prisma.resellerReportComment.findMany({
    orderBy: { createdAt: "desc" },
    select: { reportId: true, authorName: true, body: true, createdAt: true },
  });
  const lastByReport = new Map<string, { authorName: string; body: string }>();
  for (const c of comments) if (!lastByReport.has(c.reportId)) lastByReport.set(c.reportId, c as any);

  const byStatus: Record<string, number> = {};
  for (const r of reports) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  console.log(`${reports.length} reports — ` + Object.entries(byStatus).map(([s, n]) => `${s}:${n}`).join("  ") + "\n");

  for (const r of reports) {
    const last = lastByReport.get(r.id);
    console.log(`[${r.status}]  ${r.title}   (${r.createdAt.toISOString().slice(0, 10)})  id=${r.id}`);
    if (last) console.log(`      ↳ last: ${last.authorName}: ${(last.body || "").replace(/\s+/g, " ").slice(0, 110)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
