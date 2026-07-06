/** Align cmr80t9rk (Meal Bundle) to IN_TESTING — fix is deployed + verified on
 *  the reporter's data; the "fix live" comment was already posted. Status-only.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_flip-cmr80t9rk-in-testing.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const r = await prisma.resellerReport.findFirst({ where: { id: { startsWith: "cmr80t9rk" } } });
  if (!r) { console.log("✗ not found"); return; }
  if (r.status !== "IN_PROGRESS") { console.log(`↷ status already ${r.status} — leaving as-is`); return; }
  await prisma.resellerReport.update({ where: { id: r.id }, data: { status: "IN_TESTING" } });
  console.log(`✅ "${r.title}" → IN_TESTING`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
