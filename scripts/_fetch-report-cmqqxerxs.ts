/** Dev-only: print reseller report cmqqxerxs (title, body, comments).
 *   npx tsx scripts/run-on-prod.ts scripts/_fetch-report-cmqqxerxs.ts */
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
    where: { id: { startsWith: "cmqqxerxs" } },
    include: { comments: { orderBy: { createdAt: "asc" } } },
  });
  for (const r of reports) {
    console.log("=== REPORT", r.id, "===");
    console.log("title:", r.title);
    console.log("status:", r.status, "| type:", (r as any).type ?? "?", "| created:", r.createdAt);
    console.log("--- body ---");
    console.log(r.body);
    for (const c of r.comments) {
      console.log(`--- comment [${c.authorName ?? "?"}] ${c.createdAt.toISOString()} ---`);
      console.log(c.body);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
