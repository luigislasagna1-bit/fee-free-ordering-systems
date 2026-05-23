/**
 * Direct-URL grant of an active RestaurantAddOn row to a specific
 * restaurant on a specific Neon branch. Bypasses src/lib/db.ts and
 * dotenv loading so it can target a branch without changing .env.local.
 *
 * Run:
 *   npx tsx scripts/grant-addon-on-branch.ts <restaurant-slug> <addon-slug> "<postgres-url>"
 *
 * Example:
 *   npx tsx scripts/grant-addon-on-branch.ts luigis-lasagna-pizzeria hosted_website "postgresql://...dawn-tree..."
 *
 * Idempotent: if the restaurant already has an ACTIVE row for this add-on
 * the script no-ops. If a non-active row exists it gets flipped to active.
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const restaurantSlug = process.argv[2];
  const addOnSlug = process.argv[3];
  const url = process.argv[4];
  if (!restaurantSlug || !addOnSlug || !url) {
    console.error('Usage: grant-addon-on-branch.ts <restaurant-slug> <addon-slug> "<postgres-url>"');
    process.exit(1);
  }
  console.log(`Granting "${addOnSlug}" to restaurant "${restaurantSlug}"`);
  console.log(`Target branch: ${url.replace(/:[^:@]+@/, ":***@")}\n`);

  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug: restaurantSlug },
      select: { id: true, name: true, subdomain: true },
    });
    if (!restaurant) {
      console.error(`Restaurant "${restaurantSlug}" not found on this branch.`);
      process.exit(1);
    }

    const addOn = await prisma.addOn.findUnique({
      where: { slug: addOnSlug },
      select: { id: true, name: true, enabledFeatures: true },
    });
    if (!addOn) {
      console.error(`AddOn "${addOnSlug}" not found on this branch.`);
      process.exit(1);
    }

    const existing = await prisma.restaurantAddOn.findUnique({
      where: {
        restaurantId_addOnId: { restaurantId: restaurant.id, addOnId: addOn.id },
      },
    });

    if (existing && existing.status === "active") {
      console.log(`Already active: ${restaurant.name} → ${addOn.name}`);
    } else if (existing) {
      await prisma.restaurantAddOn.update({
        where: { id: existing.id },
        data: { status: "active", cancelAtPeriodEnd: false },
      });
      console.log(`Reactivated: ${restaurant.name} → ${addOn.name}`);
    } else {
      const fakeFarFuture = new Date(Date.now() + 30 * 365 * 24 * 60 * 60 * 1000);
      await prisma.restaurantAddOn.create({
        data: {
          restaurantId: restaurant.id,
          addOnId: addOn.id,
          status: "active",
          currentPeriodEnd: fakeFarFuture,
          cancelAtPeriodEnd: false,
        },
      });
      console.log(`Granted: ${restaurant.name} → ${addOn.name}`);
    }

    const effectiveSub = restaurant.subdomain ?? restaurantSlug;
    console.log(`Features enabled: ${addOn.enabledFeatures}`);
    console.log(`\nNext: visit https://${effectiveSub}.feefreeordering.com`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
