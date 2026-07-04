/** Read-only: reports with FABRIZIO comments in the last 36h — id, title,
 *  status, and his latest comments so we can triage.
 *  npx tsx scripts/run-on-prod.ts scripts/_fetch-recent-fabrizio-updates.ts */
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

  const since = new Date(Date.now() - 36 * 3600 * 1000);
  const comments = await prisma.resellerReportComment.findMany({
    where: { createdAt: { gte: since }, NOT: { authorEmail: "admin@feefreeordering.com" } },
    orderBy: { createdAt: "asc" },
    include: { report: { select: { id: true, title: true, status: true } } },
  });
  if (comments.length === 0) { console.log("No non-admin comments in the last 36h."); }
  const byReport = new Map<string, { title: string; status: string; bodies: string[] }>();
  for (const c of comments) {
    const key = c.report.id;
    if (!byReport.has(key)) byReport.set(key, { title: c.report.title, status: c.report.status, bodies: [] });
    byReport.get(key)!.bodies.push(`[${c.createdAt.toISOString()}] ${c.authorName}: ${c.body}`);
  }
  for (const [id, r] of byReport) {
    console.log(`\n═══ ${id} · ${r.status} · ${r.title}`);
    for (const b of r.bodies) console.log(`  ${b.slice(0, 900)}`);
  }
  // Also any NEW reports created in the window
  const fresh = await prisma.resellerReport.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, title: true, status: true, type: true, body: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const r of fresh) {
    console.log(`\n▲ NEW ${r.createdAt.toISOString()} · ${r.id} · ${r.type} · ${r.title}\n  ${r.body.slice(0, 700)}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
