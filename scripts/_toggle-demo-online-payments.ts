/**
 * DEV-ONLY: give the demo restaurant a working "online card" setup so the
 * ShipDay prepaid-delivery checkout can be verified end-to-end:
 *   - paymentMethods = ["cash","online_card"] (legacy flat list)
 *   - PaymentProvider row active with a dummy publishable key
 *   - card_payments entitlement via an active RestaurantAddOn
 *   npx tsx scripts/_toggle-demo-online-payments.ts on|off
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only script, aborting.");
  const on = process.argv[2] !== "off";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo restaurant not found");

  await prisma.restaurant.update({
    where: { id: r.id },
    data: { paymentMethods: on ? JSON.stringify(["cash", "online_card"]) : "[]" },
  });
  await prisma.paymentProvider.upsert({
    where: { restaurantId: r.id },
    create: { restaurantId: r.id, isActive: on, publishableKey: on ? "pk_test_dummy_dev_only" : "" },
    update: { isActive: on, publishableKey: on ? "pk_test_dummy_dev_only" : "" },
  });

  const addOn = await prisma.addOn.findFirst({
    where: { enabledFeatures: { contains: "card_payments" } },
    select: { id: true, slug: true },
  });
  if (!addOn) throw new Error("no AddOn with card_payments feature found");
  if (on) {
    const existing = await prisma.restaurantAddOn.findFirst({ where: { restaurantId: r.id, addOnId: addOn.id } });
    if (existing) await prisma.restaurantAddOn.update({ where: { id: existing.id }, data: { status: "active" } });
    else await prisma.restaurantAddOn.create({ data: { restaurantId: r.id, addOnId: addOn.id, status: "active" } });
  } else {
    await prisma.restaurantAddOn.deleteMany({ where: { restaurantId: r.id, addOnId: addOn.id } });
  }
  console.log(`✅ online payments ${on ? "ON" : "OFF"} for demo (addOn ${addOn.slug})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
