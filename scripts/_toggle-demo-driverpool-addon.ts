/**
 * DEV-ONLY: grant/remove the driver_pool entitlement on the demo restaurant
 * (to test the ShipDay online-payment admin gate in isolation).
 *   npx tsx scripts/_toggle-demo-driverpool-addon.ts on|off
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
  const addOn = await prisma.addOn.findFirst({ where: { enabledFeatures: { contains: "driver_pool" } }, select: { id: true, slug: true } });
  if (!r || !addOn) throw new Error("restaurant or driver_pool add-on not found");
  if (on) {
    const existing = await prisma.restaurantAddOn.findFirst({ where: { restaurantId: r.id, addOnId: addOn.id } });
    if (existing) await prisma.restaurantAddOn.update({ where: { id: existing.id }, data: { status: "active" } });
    else await prisma.restaurantAddOn.create({ data: { restaurantId: r.id, addOnId: addOn.id, status: "active" } });
  } else {
    await prisma.restaurantAddOn.deleteMany({ where: { restaurantId: r.id, addOnId: addOn.id } });
  }
  console.log(`✅ driver_pool ${on ? "ON" : "OFF"} for demo (addOn ${addOn.slug})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
