/**
 * Read-only diagnostic: what's the state of the prod DB?
 *
 * Checks:
 *   - Endpoint host (mask password) — confirm we're hitting the right DB
 *   - Do the new tables exist? (KitchenDevice, AddOn, RestaurantAddOn)
 *   - Do the new columns exist on Restaurant + User?
 *   - Counts: Restaurant, User, Order, AddOn, RestaurantAddOn, KitchenDevice
 *   - Free plan present?
 *   - Restaurants on legacy plans (need migrate-to-free)
 *   - Restaurants with stripeChargesEnabled but no online_payments add-on (need grandfather)
 *
 * Usage:
 *   npx tsx scripts/verify-prod-state.ts                # uses .env.local
 *   npx tsx scripts/verify-prod-state.ts <database-url>
 *
 * Writes nothing. Safe to run anytime.
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const explicitUrl = process.argv[2];
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const masked = url.replace(/:[^:@]+@/, ":****@");
  console.log(`Database: ${masked}\n`);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // 1. Table existence via raw query
  const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(`
    SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename IN ('KitchenDevice','AddOn','RestaurantAddOn','Restaurant','User','SubscriptionPlan')
    ORDER BY tablename
  `);
  console.log("Phase-1+4 tables present in this DB:");
  for (const t of tables) console.log(`   ${t.tablename}`);
  console.log("");

  // 2. Column existence on Restaurant + User
  const cols: Array<{ table_name: string; column_name: string }> = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public'
      AND ((table_name='Restaurant' AND column_name IN ('publishedAt','ownerEmailVerifiedAt','widgetPublicId'))
        OR (table_name='User' AND column_name IN ('emailVerifiedAt','emailVerifyToken')))
    ORDER BY table_name, column_name
  `);
  console.log("Phase-1 columns present:");
  for (const c of cols) console.log(`   ${c.table_name}.${c.column_name}`);
  console.log("");

  // 3. Counts
  const restaurantCount = await prisma.restaurant.count();
  const userCount = await prisma.user.count();
  const orderCount = await prisma.order.count();
  console.log("Row counts:");
  console.log(`   Restaurant: ${restaurantCount}`);
  console.log(`   User:       ${userCount}`);
  console.log(`   Order:      ${orderCount}`);

  // Conditionally count new tables if they exist
  const tableNames = new Set(tables.map((t) => t.tablename));
  if (tableNames.has("AddOn")) {
    const addOnCount = await prisma.addOn.count();
    console.log(`   AddOn:      ${addOnCount}`);
  }
  if (tableNames.has("RestaurantAddOn")) {
    const restAddOnCount = await prisma.restaurantAddOn.count();
    console.log(`   RestaurantAddOn: ${restAddOnCount}`);
  }
  if (tableNames.has("KitchenDevice")) {
    const kdCount = await prisma.kitchenDevice.count();
    console.log(`   KitchenDevice:   ${kdCount}`);
  }
  console.log("");

  // 4. Free plan + legacy-plan restaurants
  try {
    const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "free" } });
    console.log(`Free plan in DB: ${freePlan ? "yes (" + freePlan.id + ")" : "NO — seed-addons not run yet"}`);
    const legacy = await prisma.restaurant.count({
      where: { subscriptionPlan: { slug: { in: ["starter", "growth", "pro", "enterprise"] } } },
    });
    console.log(`Restaurants still on legacy plans: ${legacy}`);
  } catch (e) {
    console.log("Free plan + legacy check skipped:", (e as Error).message);
  }

  // 5. Stripe-charges-enabled restaurants without online_payments add-on
  if (tableNames.has("RestaurantAddOn") && tableNames.has("AddOn")) {
    try {
      const onlinePayments = await prisma.addOn.findUnique({ where: { slug: "online_payments" } });
      const activeCardRestaurants = await prisma.restaurant.findMany({
        where: { stripeChargesEnabled: true, stripeAccountId: { not: null } },
        select: { id: true, slug: true },
      });
      let grandfathered = 0;
      let needsGrandfather = 0;
      if (onlinePayments) {
        for (const r of activeCardRestaurants) {
          const has = await prisma.restaurantAddOn.findUnique({
            where: { restaurantId_addOnId: { restaurantId: r.id, addOnId: onlinePayments.id } },
          });
          if (has) grandfathered++; else needsGrandfather++;
        }
      } else {
        needsGrandfather = activeCardRestaurants.length;
      }
      console.log(`\nCard-payment restaurants: ${activeCardRestaurants.length}`);
      console.log(`   already grandfathered into online_payments: ${grandfathered}`);
      console.log(`   needing grandfather script: ${needsGrandfather}`);
    } catch (e) {
      console.log("Stripe-charges check skipped:", (e as Error).message);
    }
  }

  await prisma.$disconnect();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
