/** Correct status on the 2026-07-05 batch: FIXED → IN_TESTING (Luigi marks
 *  FIXED himself after Fabrizio verifies). No comments/notifications touched.
 *   npx tsx scripts/run-on-prod.ts scripts/_flip-reports-to-in-testing.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const PREFIXES = ["cmr80t9rk", "cmr809iu8", "cmr80joh0"];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    for (const p of PREFIXES) {
      const r = await prisma.resellerReport.findFirst({ where: { id: { startsWith: p } } });
      if (!r) { console.log(`✗ ${p} not found`); continue; }
      if (r.status !== "FIXED") { console.log(`- ${p} already ${r.status}, skipped`); continue; }
      await prisma.resellerReport.update({ where: { id: r.id }, data: { status: "IN_TESTING" } });
      console.log(`✅ ${r.title} → IN_TESTING`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
