/**
 * Dev-only: inspect promotion rows for a restaurant to debug auto-apply.
 *
 * Usage:
 *   npx tsx scripts/dev-inspect-promos.ts <restaurant-slug> [database-url]
 *
 * Example:
 *   npx tsx scripts/dev-inspect-promos.ts luigis-lasagna-pizzeria \
 *     "postgresql://...dawn-tree..."  # prod
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const slug = process.argv[2];
  const url = process.argv[3] ?? process.env.DATABASE_URL;
  if (!slug) {
    console.error("Usage: npx tsx scripts/dev-inspect-promos.ts <restaurant-slug> [database-url]");
    process.exit(1);
  }
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    console.error(`Restaurant not found: ${slug}`);
    process.exit(1);
  }
  console.log(`\nRestaurant: ${restaurant.name} (${restaurant.slug})\n`);

  const promos = await prisma.promotion.findMany({
    where: { restaurantId: restaurant.id },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Found ${promos.length} promotion(s):\n`);
  for (const p of promos) {
    console.log(`▸ ${p.name}  [${p.promotionType}]`);
    console.log(`  id:              ${p.id}`);
    console.log(`  isActive:        ${p.isActive}`);
    console.log(`  autoApply:       ${p.autoApply}`);
    console.log(`  stackingRule:    ${p.stackingRule}`);
    console.log(`  orderType:       ${p.orderType}`);
    console.log(`  customerType:    ${p.customerType}`);
    console.log(`  minimumOrder:    $${p.minimumOrder}`);
    console.log(`  couponCode:      ${p.couponCode ?? "(none — auto-apply only)"}`);
    console.log(`  usageLimit:      ${p.usageLimit ?? "unlimited"}  (used ${p.usedCount})`);
    console.log(`  daysOfWeek:      ${p.daysOfWeek ?? "any"}`);
    console.log(`  usableHourStart: ${p.usableHourStart ?? "any"}`);
    console.log(`  usableHourEnd:   ${p.usableHourEnd ?? "any"}`);
    console.log(`  startsAt:        ${p.startsAt?.toISOString() ?? "—"}`);
    console.log(`  endsAt:          ${p.endsAt?.toISOString() ?? "—"}`);
    console.log(`  paymentMethodSlugs:    ${p.paymentMethodSlugs ?? "any"}`);
    console.log(`  deliveryZoneIds:       ${p.deliveryZoneIds ?? "any"}`);
    console.log(`  onceLifetimePerClient: ${p.onceLifetimePerClient}`);
    console.log(`  rules:           ${p.rules}`);
    console.log(`  ruleConfig:      ${JSON.stringify(p.ruleConfig)}`);
    console.log("");
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
