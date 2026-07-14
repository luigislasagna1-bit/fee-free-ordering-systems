/**
 * DEV-ONLY: enable/disable Fee Free Delivery on the demo restaurant so the
 * /driver flow can be exercised locally. Sets FeeFreeDeliveryConfig.enabled
 * directly (bypasses the online-payment/entitlement gate the admin API enforces).
 *   npx tsx scripts/_enable-feefree-demo.ts on|off [manual]
 * Pass "manual" to set autoSend=false (hold for manual dispatch); default auto.
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
  const autoSend = process.argv[3] !== "manual";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo-pizza-palace not found");
  await prisma.feeFreeDeliveryConfig.upsert({
    where: { restaurantId: r.id },
    create: { restaurantId: r.id, enabled: on, autoSend },
    update: { enabled: on, autoSend },
  });
  console.log(`✅ Fee Free Delivery ${on ? "ON" : "OFF"} (autoSend=${autoSend}) for demo-pizza-palace`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
