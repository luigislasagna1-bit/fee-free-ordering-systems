/**
 * One-off fix script: my seed bulldozed Luigi's "priced and synced"
 * decisions on most add-ons by setting comingSoon=true. This script
 * restores his intent by setting comingSoon=false for everything EXCEPT
 * the 3 add-ons that are genuinely zero-code:
 *   - pos_module
 *   - branded_mobile_app
 *   - phone_ordering (NEW — never had a price)
 *
 * Run twice — once for each Neon branch:
 *   npx tsx scripts/fix-coming-soon-flags.ts                                   # purple-brook (.env.local active URL)
 *   npx tsx scripts/fix-coming-soon-flags.ts "<dawn-tree-url>"                 # explicit URL for prod
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const explicitUrl = process.argv[2];
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

/** Add-on slugs that should KEEP comingSoon=true — genuinely no
 *  implementation yet. Everything else gets comingSoon=false so Luigi's
 *  existing prices + Stripe syncs work as intended. */
const KEEP_COMING_SOON = new Set([
  "pos_module",
  "branded_mobile_app",
  "phone_ordering",
]);

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`Fixing comingSoon flags against: ${url.replace(/:[^:@]+@/, ":****@")}`);

  const addOns = await prisma.addOn.findMany({ orderBy: { displayOrder: "asc" } });

  for (const a of addOns) {
    const shouldBeComingSoon = KEEP_COMING_SOON.has(a.slug);
    if (a.comingSoon === shouldBeComingSoon) {
      console.log(`  ${a.slug.padEnd(22)} comingSoon=${a.comingSoon}  (unchanged)`);
      continue;
    }
    await prisma.addOn.update({
      where: { id: a.id },
      data: { comingSoon: shouldBeComingSoon },
    });
    console.log(`  ${a.slug.padEnd(22)} ${a.comingSoon} → ${shouldBeComingSoon}  ✓ updated`);
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
