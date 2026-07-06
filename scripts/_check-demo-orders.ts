/* DEV-only: list recent demo orders (type, name, address fields) + reservations. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true, kitchenDeliveryShowName: true } });
  if (!r) throw new Error("no demo restaurant");
  console.log("kitchenDeliveryShowName:", (r as any).kitchenDeliveryShowName);
  const orders = await prisma.order.findMany({
    where: { restaurantId: r.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, type: true, status: true, customerName: true, deliveryAddress: true, deliveryCity: true, deliveryZip: true, createdAt: true },
  });
  for (const o of orders) console.log(`${o.type} ${o.status} "${o.customerName}" addr="${o.deliveryAddress}" city="${o.deliveryCity}" zip="${o.deliveryZip}" ${o.createdAt.toISOString().slice(0, 10)}`);
  const res = await prisma.tableReservation.findMany({ where: { restaurantId: r.id }, take: 3, orderBy: { createdAt: "desc" }, select: { id: true, customerName: true, status: true } }).catch(() => []);
  for (const x of res as any[]) console.log(`RES ${x.status} "${x.customerName}"`);
}
main().finally(() => prisma.$disconnect());
