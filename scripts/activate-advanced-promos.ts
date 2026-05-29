/**
 * One-off: flip the Advanced Promo Marketing add-on to its Phase 2c
 * launch state — $19.99/mo, NOT coming soon. The seed script's upsert
 * guards against overwriting these fields, so we update directly.
 *
 * Usage:
 *   npx tsx scripts/activate-advanced-promos.ts                 # uses .env.local DATABASE_URL
 *   npx tsx scripts/activate-advanced-promos.ts <database-url>  # explicit URL
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.argv[2] ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`Connecting to: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

  const before = await prisma.addOn.findUnique({
    where: { slug: "advanced_promos" },
    select: { id: true, name: true, monthlyPriceCents: true, comingSoon: true, enabledFeatures: true },
  });
  if (!before) {
    console.error("advanced_promos add-on row not found. Run prisma/seed-addons.ts first.");
    process.exit(1);
  }
  console.log("Before:");
  console.log(`  monthlyPriceCents = ${before.monthlyPriceCents}`);
  console.log(`  comingSoon        = ${before.comingSoon}`);
  console.log(`  enabledFeatures   = ${before.enabledFeatures}\n`);

  const after = await prisma.addOn.update({
    where: { slug: "advanced_promos" },
    data: {
      monthlyPriceCents: 1999, // $19.99
      comingSoon: false,
      enabledFeatures: JSON.stringify([
        "customer_segmentation",
        "automated_campaigns",
        "advanced_promo_types",
      ]),
    },
  });
  console.log("After:");
  console.log(`  monthlyPriceCents = ${after.monthlyPriceCents}`);
  console.log(`  comingSoon        = ${after.comingSoon}`);
  console.log(`  enabledFeatures   = ${after.enabledFeatures}\n`);
  console.log("Done.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
