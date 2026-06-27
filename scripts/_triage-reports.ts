/** READ-ONLY triage: every reseller report + its recent comments, so we can see what came in,
 *  what we replied, and who has the LAST WORD (reporter = needs our action; us = awaiting test).
 *    npx tsx scripts/run-on-prod.ts scripts/_triage-reports.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA = "admin@feefreeordering.com";
const DAYS = 4;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const since = new Date(Date.now() - DAYS * 86_400_000);
  const reports = await prisma.resellerReport.findMany({
    orderBy: { updatedAt: "desc" },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });

  const fmt = (d: Date | string) => new Date(d).toISOString().slice(0, 16).replace("T", " ");
  const reporterOf = (r: any) => r.reportedByName || r.authorName || r.reportedByEmail || r.authorEmail || "?";
  const isUs = (c: any) => (c.authorEmail || "").toLowerCase() === SA;

  const recent: any[] = [], older: any[] = [];
  for (const r of reports) {
    const last = r.comments[r.comments.length - 1];
    const lastAt = last ? new Date(last.createdAt) : new Date(r.createdAt);
    (new Date(r.createdAt) >= since || lastAt >= since ? recent : older).push(r);
  }

  console.log(`\n========== ACTIVE IN LAST ${DAYS} DAYS (${recent.length}) ==========`);
  for (const r of reports.filter((x) => recent.includes(x))) {
    const last = r.comments[r.comments.length - 1];
    const flag = last && !isUs(last) ? "🔴 REPORTER HAS LAST WORD → needs our action"
               : last ? "🟢 we replied last → awaiting their re-test"
               : "🆕 no comments yet";
    console.log(`\n[${r.status}] "${r.title}"  (${r.type}/${r.priority})`);
    console.log(`   by ${reporterOf(r)} · created ${fmt(r.createdAt)} · id ${r.id}`);
    console.log(`   ${flag}`);
    if (new Date(r.createdAt) >= since) {
      const body = (r.body || "").replace(/\s+/g, " ").slice(0, 300);
      console.log(`   REPORT: ${body}${(r.body || "").length > 300 ? "…" : ""}`);
    }
    for (const c of r.comments.filter((c: any) => new Date(c.createdAt) >= since)) {
      const who = isUs(c) ? "US" : `★${(c.authorName || "reporter").toUpperCase()}`;
      const body = (c.body || "").replace(/\s+/g, " ").slice(0, 220);
      console.log(`     • ${fmt(c.createdAt)} ${who}: ${body}${(c.body || "").length > 220 ? "…" : ""}`);
    }
  }

  console.log(`\n========== OLDER / QUIET (${older.length}) ==========`);
  for (const r of reports.filter((x) => older.includes(x)))
    console.log(`[${r.status}] "${r.title}" — ${reporterOf(r)} — ${fmt(r.createdAt)}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
