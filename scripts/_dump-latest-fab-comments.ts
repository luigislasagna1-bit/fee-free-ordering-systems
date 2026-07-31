/** Read-only: full text of every reseller-report comment newer than a cutoff,
 *  across BOTH DATABASE_URLs, so nothing from Fabrizio gets missed. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const SINCE = new Date(process.argv[2] || "2026-07-29T23:35:00Z");

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const l of env.split(/\r?\n/)) {
  const m = l.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function main() {
  for (const url of urls) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const p = new PrismaClient({ adapter } as any);
    try {
      const rows = await p.resellerReportComment.findMany({
        where: { createdAt: { gt: SINCE } },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true, authorName: true, body: true,
          report: { select: { id: true, title: true, status: true } },
        },
      });
      if (!rows.length) continue;
      console.log(`\n########## ${rows.length} comment(s) since ${SINCE.toISOString()}`);
      for (const c of rows) {
        console.log(`\n=== [${c.report.status}] "${c.report.title}" (${c.report.id.slice(0, 9)})`);
        console.log(`--- ${c.authorName} @ ${c.createdAt.toISOString()}`);
        console.log(c.body);
      }
    } catch (e: any) {
      console.log(`db error: ${String(e?.message).slice(0, 120)}`);
    } finally { await p.$disconnect(); }
  }
}
main();
