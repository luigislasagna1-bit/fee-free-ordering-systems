/**
 * Dev-only: grant an add-on entitlement to a restaurant DIRECTLY,
 * bypassing the Stripe subscription flow. Creates a RestaurantAddOn
 * row with status="active" so hasFeature() resolves to true.
 *
 * Use this for local testing of features gated behind add-ons when
 * you haven't yet synced the AddOn to Stripe or wired up the real
 * subscription flow. Idempotent (upsert).
 *
 * Usage:
 *   npx tsx scripts/dev-grant-addon.ts <restaurant-slug-or-id> <addon-slug>
 *
 * Examples:
 *   npx tsx scripts/dev-grant-addon.ts demo-pizza-palace advanced_promos
 *   npx tsx scripts/dev-grant-addon.ts demo-pizza-palace marketplace
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  if (!arg1 || !arg2) {
    console.error("Usage: npx tsx scripts/dev-grant-addon.ts <restaurant-slug-or-id> <addon-slug>");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // Resolve restaurant
  const restaurant = await prisma.restaurant.findFirst({
    where: { OR: [{ slug: arg1 }, { id: arg1 }] },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    console.error(`Restaurant not found: ${arg1}`);
    process.exit(1);
  }

  // Resolve add-on
  const addOn = await prisma.addOn.findUnique({
    where: { slug: arg2 },
    select: { id: true, slug: true, name: true, enabledFeatures: true },
  });
  if (!addOn) {
    console.error(`AddOn not found: ${arg2}`);
    process.exit(1);
  }

  // Grant
  const row = await prisma.restaurantAddOn.upsert({
    where: {
      restaurantId_addOnId: {
        restaurantId: restaurant.id,
        addOnId: addOn.id,
      },
    },
    update: {
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year out
    },
    create: {
      restaurantId: restaurant.id,
      addOnId: addOn.id,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
  });

  console.log(`\nGranted ${addOn.name} to ${restaurant.name} (${restaurant.slug})`);
  console.log(`  RestaurantAddOn.id  = ${row.id}`);
  console.log(`  status              = ${row.status}`);
  console.log(`  Unlocks features:     ${addOn.enabledFeatures}\n`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
