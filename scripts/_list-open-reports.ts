/** Read-only: every reseller report not FIXED, newest activity first, with
 *  each comment's author + timestamp so we can spot unanswered follow-ups. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" }); config({ path: ".env" });
async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const reports = await p.resellerReport.findMany({
    where: { status: { not: "FIXED" } },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, title: true, status: true, updatedAt: true, authorName: true,
      comments: { orderBy: { createdAt: "asc" }, select: { authorName: true, createdAt: true, body: true } },
    },
  });
  for (const r of reports) {
    console.log(`\n=== [${r.status}] "${r.title}" (${r.id.slice(0, 9)}) upd ${r.updatedAt.toISOString()}`);
    for (const c of r.comments) {
      const who = c.authorName?.toUpperCase().includes("ADMIN") ? "US " : "FAB";
      console.log(`  ${who} ${c.createdAt.toISOString().slice(0, 16)}  ${c.body.slice(0, 110).replace(/\n/g, " ")}`);
    }
  }
  console.log(`\n${reports.length} non-FIXED report(s).`);
}
main();
