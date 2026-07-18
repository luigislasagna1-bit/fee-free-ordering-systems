/** DEV-only: seed/clean throwaway reseller reports for the Mark-all-read
 *  browser E2E. `npx tsx scripts/_seed-local-reports.ts seed|clean`. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const TAG = "[e2e-mark-all-read]";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const mode = process.argv[2];
  if (mode === "seed") {
    for (const [i, type] of (["BUG", "FEATURE_REQUEST"] as const).entries()) {
      await prisma.resellerReport.create({
        data: {
          title: `${TAG} throwaway ${i + 1}`,
          body: "Throwaway row for the Mark-all-read browser E2E. Safe to delete.",
          type,
          authorEmail: "fabrizio@example.test",
          authorName: "E2E Fixture",
        },
      });
    }
    console.log("✓ seeded 2 throwaway reports");
  } else if (mode === "clean") {
    const r = await prisma.resellerReport.deleteMany({ where: { title: { startsWith: TAG } } });
    console.log(`✓ deleted ${r.count} throwaway reports`);
  } else {
    throw new Error("Usage: seed|clean");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
