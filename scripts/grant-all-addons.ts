/**
 * Grant a restaurant ACTIVE rows for every add-on in the catalog — i.e. unlock
 * everything (all paid features). Idempotent upsert by (restaurantId, addOnId).
 * Manual grant (no Stripe) — for the owner's own restaurant. Luigi 2026-06-11.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/grant-all-addons.ts luigis-lasagna-pizzeria
 *   npx tsx scripts/grant-all-addons.ts luigis-lasagna-pizzeria            # dev DB
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const slug = process.argv[2] ?? "luigis-lasagna-pizzeria";
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) { console.error(`Restaurant not found: ${slug}`); process.exit(1); }
  console.log(`Granting ALL add-ons to: ${restaurant.name} (${restaurant.slug})\n`);

  // Every catalog add-on (isActive). Includes GrowthNet + the individual ones.
  const addOns = await prisma.addOn.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true },
    orderBy: { displayOrder: "asc" },
  });

  const oneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  for (const a of addOns) {
    await prisma.restaurantAddOn.upsert({
      where: { restaurantId_addOnId: { restaurantId: restaurant.id, addOnId: a.id } },
      update: { status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: oneYear },
      create: { restaurantId: restaurant.id, addOnId: a.id, status: "active", currentPeriodEnd: oneYear },
    });
    console.log(`  ✓ ${a.slug.padEnd(22)} (${a.name})`);
  }

  console.log(`\nDone — ${addOns.length} add-on(s) active for ${restaurant.slug}.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
