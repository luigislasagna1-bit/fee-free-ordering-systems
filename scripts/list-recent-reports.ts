/** Read-only: list recent reseller reports so we can assemble the status batch.
 *   npx tsx scripts/run-on-prod.ts scripts/list-recent-reports.ts */
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
    select: { id: true, title: true, status: true, authorEmail: true, reportedByEmail: true },
  });
  for (const r of reports) {
    console.log(`${String(r.status).padEnd(12)} ${r.id}  ${r.title}  [${r.authorEmail ?? r.reportedByEmail ?? "?"}]`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
