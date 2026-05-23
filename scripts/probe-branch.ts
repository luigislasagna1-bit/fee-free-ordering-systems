/**
 * Direct-URL probe of a Neon branch. Bypasses src/lib/db.ts and dotenv
 * loading entirely so we can target a specific branch without worrying
 * about .env.local override semantics.
 *
 * Run:
 *   npx tsx scripts/probe-branch.ts <branch-label> "<postgres-url>"
 *
 * Example:
 *   npx tsx scripts/probe-branch.ts production2 "postgresql://...dawn-tree..."
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const label = process.argv[2];
  const url = process.argv[3];
  if (!label || !url) {
    console.error('Usage: probe-branch.ts <label> "<postgres-url>"');
    process.exit(1);
  }
  console.log(`Probing branch "${label}" at ${url.replace(/:[^:@]+@/, ":***@")}\n`);

  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const restaurants = await prisma.restaurant.findMany({
      select: {
        slug: true,
        name: true,
        subdomain: true,
        customDomain: true,
        isActive: true,
        publishedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Found ${restaurants.length} restaurants:`);
    for (const r of restaurants) {
      const flags = [r.isActive ? "active" : "paused", r.publishedAt ? "published" : "unpublished"].join("/");
      console.log(`  [${flags}]  ${r.slug.padEnd(35)} (${r.name})`);
      if (r.subdomain && r.subdomain !== r.slug) console.log(`    subdomain: ${r.subdomain}`);
      if (r.customDomain) console.log(`    customDomain: ${r.customDomain}`);
    }

    // Schema sanity check: does the new column from the marketplace counter
    // commit exist on this branch?
    try {
      await prisma.$queryRaw`SELECT "marketplaceCounterApplied" FROM "Order" LIMIT 1`;
      console.log("\n[schema] Order.marketplaceCounterApplied column: PRESENT");
    } catch {
      console.log("\n[schema] Order.marketplaceCounterApplied column: MISSING (push schema needed)");
    }
    try {
      await prisma.$queryRaw`SELECT "activeDispatchMode" FROM "ShipdayConfig" LIMIT 1`;
      console.log("[schema] ShipdayConfig.activeDispatchMode column: PRESENT");
    } catch {
      console.log("[schema] ShipdayConfig.activeDispatchMode column: MISSING (push schema needed)");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
