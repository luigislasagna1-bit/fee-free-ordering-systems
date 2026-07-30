/** Read-only: dump Fabrizio's NOT-fixed reports (NEW/IN_PROGRESS/IN_TESTING) with
 *  body + comments so we can see exactly what's still outstanding. */
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
  const p = new PrismaClient({ adapter } as any);
  const reports = await p.resellerReport.findMany({
    where: {
      OR: [{ authorName: { contains: "abriz", mode: "insensitive" } }, { authorEmail: { contains: "abriz", mode: "insensitive" } }],
      status: { notIn: ["FIXED", "WONT_FIX"] },
    },
    orderBy: { updatedAt: "desc" },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  console.log(`Fabrizio OPEN reports (not FIXED/WONT_FIX): ${reports.length}\n`);
  for (const r of reports) {
    console.log("================================================");
    console.log(`[${r.status}] ${r.type} — "${r.title}"  (${r.id}, upd ${r.updatedAt.toISOString().slice(0, 16)})`);
    console.log("--- BODY ---\n" + r.body);
    if (r.comments.length) {
      console.log(`--- COMMENTS (${r.comments.length}) ---`);
      for (const c of r.comments) console.log(`  [${c.createdAt.toISOString().slice(0, 16)}] ${c.authorName}: ${c.body}`);
    }
    console.log();
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
