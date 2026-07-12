/**
 * DEV-ONLY: stage the ShipDay onboarding-wizard E2E on demo-pizza-palace —
 * grants the driver_pool entitlement (local RestaurantAddOn row, no Stripe)
 * and resets ShipdayConfig to a clean slate (own drivers, no key, no token,
 * unverified, partner not contacted) so the wizard can be walked from step 0.
 * Refuses to run against PROD (same guard as the other _seed scripts).
 *   npx tsx scripts/_seed-shipday-wizard-test.ts [slug]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const slug = process.argv[2] || "demo-pizza-palace";
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL");
  try {
    const envLocal = readFileSync(".env.local", "utf8");
    const m = envLocal.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/m);
    if (m && url === m[1]) throw new Error("REFUSING to run: active DATABASE_URL is the PROD database.");
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("REFUSING")) throw e;
  }

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!restaurant) throw new Error(`restaurant ${slug} not found`);

  // driver_pool (the wizard's gate) + online_payments (the SAVE gate: ShipDay
  // dispatch requires a usable online payment method) + a fake-but-active
  // PaymentProvider row so restaurantHasOnlinePayments() passes on dev.
  for (const slug of ["driver_pool", "online_payments"]) {
    const addOn = await prisma.addOn.findUnique({ where: { slug }, select: { id: true } });
    if (!addOn) throw new Error(`${slug} AddOn row missing — run prisma/seed-addons.ts`);
    await prisma.restaurantAddOn.upsert({
      where: { restaurantId_addOnId: { restaurantId: restaurant.id, addOnId: addOn.id } },
      create: { restaurantId: restaurant.id, addOnId: addOn.id, status: "active" },
      update: { status: "active", graceEndsAt: null },
    });
  }
  await prisma.paymentProvider.upsert({
    where: { restaurantId: restaurant.id },
    create: { restaurantId: restaurant.id, provider: "stripe", isActive: true, publishableKey: "pk_test_wizard_e2e" },
    update: { isActive: true, publishableKey: "pk_test_wizard_e2e" },
  });

  await prisma.shipdayConfig.upsert({
    where: { restaurantId: restaurant.id },
    create: { restaurantId: restaurant.id },
    update: {
      enabled: false,
      deliverySource: "own",
      apiKeyEnc: null, apiKeyIv: null, apiKeyTag: null,
      webhookToken: null,
      webhookVerifiedAt: null,
      partnerNotifiedAt: null,
    },
  });

  console.log(`✓ ${restaurant.name}: driver_pool ACTIVE, ShipdayConfig reset to clean slate — wizard starts at step 0`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
