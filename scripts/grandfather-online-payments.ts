/**
 * Grandfather every existing restaurant that already has Stripe Connect set
 * up (stripeAccountId + stripeChargesEnabled) into the new `online_payments`
 * add-on, so the `card_payments` entitlement gate added in Phase 5 doesn't
 * silently break their checkout flow.
 *
 * What it does:
 *   For each Restaurant with stripeChargesEnabled = true, insert a
 *   RestaurantAddOn row pointing at the `online_payments` AddOn with
 *   status="active" (skipping if one already exists).
 *
 * Idempotent — running twice is a no-op for restaurants already grandfathered.
 *
 * Usage:
 *   npx tsx scripts/grandfather-online-payments.ts                # dev DB
 *   npx tsx scripts/grandfather-online-payments.ts <database-url> # explicit (prod)
 *
 * MUST RUN BEFORE deploying Phase 5 to prod. Otherwise every active
 * Connect restaurant loses card-payment capability the moment the new
 * code goes live.
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
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`Grandfathering online_payments against: ${url.replace(/:[^:@]+@/, ":****@")}\n`);

  const addOn = await prisma.addOn.findUnique({ where: { slug: "online_payments" } });
  if (!addOn) {
    console.error('No "online_payments" AddOn row exists. Run `npx tsx prisma/seed-addons.ts` first.');
    process.exit(1);
  }

  // Every restaurant that's actively taking card payments today.
  const eligible = await prisma.restaurant.findMany({
    where: {
      stripeAccountId: { not: null },
      stripeChargesEnabled: true,
    },
    select: { id: true, slug: true, name: true, stripeAccountId: true },
  });
  console.log(`Found ${eligible.length} restaurant(s) currently accepting card payments.\n`);

  let grandfathered = 0;
  let skipped = 0;
  for (const r of eligible) {
    const existing = await prisma.restaurantAddOn.findUnique({
      where: { restaurantId_addOnId: { restaurantId: r.id, addOnId: addOn.id } },
    });
    if (existing) {
      console.log(`  ${r.slug.padEnd(30)} already has online_payments (${existing.status}) — skipped`);
      skipped++;
      continue;
    }
    await prisma.restaurantAddOn.create({
      data: {
        restaurantId: r.id,
        addOnId: addOn.id,
        // "active" so the entitlement check passes immediately. No Stripe
        // subscription is created — they were grandfathered, they aren't
        // paying us. If you later want to monetize, downgrade by hand or
        // expire these via a follow-up script.
        status: "active",
        stripeSubscriptionId: null,
      },
    });
    console.log(`  ${r.slug.padEnd(30)} grandfathered → online_payments active`);
    grandfathered++;
  }

  console.log(`\nDone. ${grandfathered} grandfathered, ${skipped} already had it.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
