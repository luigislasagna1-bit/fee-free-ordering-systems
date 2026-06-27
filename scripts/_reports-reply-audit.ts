/** READ-ONLY: which IN_TESTING / FIXED reports LACK a "what we did" reply from us?
 *    npx tsx scripts/run-on-prod.ts scripts/_reports-reply-audit.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA = "admin@feefreeordering.com";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const reports = await prisma.resellerReport.findMany({
    where: { status: { in: ["IN_TESTING", "FIXED"] } },
    include: { comments: true },
    orderBy: { createdAt: "desc" },
  });
  const fmt = (d: any) => new Date(d).toISOString().slice(0, 10);
  const missing = reports.filter((r) => !r.comments.some((c: any) => (c.authorEmail || "").toLowerCase() === SA));
  console.log(`${reports.length} done (IN_TESTING/FIXED) reports. ${missing.length} have NO reply from us:\n`);
  for (const r of missing) console.log(`  [${r.status}] "${r.title}" — ${fmt(r.createdAt)} — id ${r.id}`);
  if (missing.length === 0) console.log("  ✓ every done report has at least one 'what we did' reply.");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
