/**
 * READ-ONLY: the most recently ACTIVE reseller reports (any author), with
 * a spotlight on Fabrizio's, so we can pick up "the one he put recently".
 * Sorts by latest activity (comment/report) so fresh threads float up.
 *   npx tsx scripts/run-on-prod.ts scripts/_recent-fabrizio-reports.ts
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
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true, title: true, type: true, status: true, priority: true,
      authorName: true, authorEmail: true, createdAt: true,
      comments: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, authorName: true } },
      _count: { select: { comments: true } },
    },
  });

  console.log(`=== 25 most recently CREATED reseller reports ===`);
  for (const r of reports) {
    const lastComment = r.comments[0];
    const lastActivity = lastComment && lastComment.createdAt > r.createdAt ? lastComment.createdAt : r.createdAt;
    const fab = /fabri|pisu/i.test(r.authorName + r.authorEmail) ? " ⭐FABRIZIO" : "";
    console.log(
      `\n[${r.status}/${r.type}/${r.priority}] ${r.title}${fab}\n` +
      `  id=${r.id}  by=${r.authorName} <${r.authorEmail}>\n` +
      `  created=${r.createdAt.toISOString()}  comments=${r._count.comments}` +
      (lastComment ? `  lastComment=${lastComment.createdAt.toISOString()} by ${lastComment.authorName}` : "  (no comments)") +
      `  lastActivity=${lastActivity.toISOString()}`
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
