/**
 * One-shot grant: activate the "Sales Optimized Website" (hosted_website)
 * add-on subscription for a target restaurant. Used for testing the
 * subdomain → hosted-site routing pipeline end-to-end.
 *
 * Idempotent: if the restaurant already has an active row for this add-on,
 * the script no-ops. Sets status=active so hasFeature("hosted_marketing_page")
 * starts returning true immediately.
 *
 * Run (against whichever DATABASE_URL is active in .env.local):
 *   npx tsx scripts/grant-hosted-site-addon.ts <restaurant-slug>
 *
 * Example:
 *   npx tsx scripts/grant-hosted-site-addon.ts luigis-lasagna-pizzeria
 */
import * as dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports
const prisma = require("@/lib/db").default;

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: npx tsx scripts/grant-hosted-site-addon.ts <restaurant-slug>");
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, subdomain: true },
  });
  if (!restaurant) {
    console.error(`Restaurant with slug "${slug}" not found.`);
    process.exit(1);
  }

  const addOn = await prisma.addOn.findUnique({
    where: { slug: "hosted_website" },
    select: { id: true, name: true },
  });
  if (!addOn) {
    console.error('AddOn "hosted_website" not found. Run prisma/seed-addons.ts first.');
    process.exit(1);
  }

  const existing = await prisma.restaurantAddOn.findUnique({
    where: {
      restaurantId_addOnId: { restaurantId: restaurant.id, addOnId: addOn.id },
    },
  });

  if (existing && existing.status === "active") {
    console.log(`Already active: ${restaurant.name} (${slug}) → ${addOn.name}`);
    console.log(`Subdomain should be: ${restaurant.subdomain ?? slug}.feefreeordering.com`);
    return;
  }

  if (existing) {
    await prisma.restaurantAddOn.update({
      where: { id: existing.id },
      data: { status: "active", cancelAtPeriodEnd: false },
    });
    console.log(`Reactivated: ${restaurant.name} → ${addOn.name}`);
  } else {
    // Set a 30-year currentPeriodEnd so this test grant doesn't lapse and
    // surprise us mid-debug. We'll clean up explicitly later.
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

  console.log(`\nNext: visit https://${restaurant.subdomain ?? slug}.feefreeordering.com`);
  console.log(`Should serve the hosted marketing page (NOT the bare ordering page).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
