/**
 * DEV-ONLY: stamp/unstamp creditApplied=5 on the most recent completed demo
 * order so the store-credit report columns can be verified end-to-end.
 *   npx tsx scripts/_toggle-demo-credit-order.ts on|off
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
  const luigi = await prisma.restaurant.findFirst({ where: { name: { contains: "Lasagna" } }, select: { id: true, name: true } });
  if (!luigi) throw new Error("Luigi's restaurant not found");
  const order = on
    ? await prisma.order.findFirst({ where: { restaurantId: luigi.id, status: { notIn: ["rejected", "cancelled"] }, total: { gt: 5 }, createdAt: { gte: new Date("2026-06-20") } }, orderBy: { createdAt: "desc" }, select: { id: true, orderNumber: true, total: true } })
    : await prisma.order.findFirst({ where: { creditApplied: 5 }, select: { id: true, orderNumber: true, total: true } });
  if (!order) { console.log("no matching order"); return; }
  await prisma.order.update({ where: { id: order.id }, data: { creditApplied: on ? 5 : 0 } });
  console.log(`${on ? "✅ stamped" : "✅ reverted"} creditApplied on ${order.orderNumber} (total ${order.total})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
