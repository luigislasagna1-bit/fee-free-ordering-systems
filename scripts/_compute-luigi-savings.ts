/** READ-ONLY prod: Luigi's Lasagna real savings vs delivery apps + order stats
 *  (for honest testimonial/counter numbers — never fabricate). */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const rest = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true, createdAt: true } });
  const orders = await prisma.order.findMany({
    where: { restaurantId: rest!.id, status: { notIn: ["rejected", "cancelled"] } },
    select: { total: true, savedVsUberEatsCents: true, createdAt: true, orderNumber: true, customerName: true },
  });
  // Verified test orders carry a TEST- order number; belt-and-suspenders on name.
  const real = orders.filter((o: any) => !String(o.orderNumber).startsWith("TEST-") && !/test/i.test(o.customerName ?? ""));
  const totalRevenue = real.reduce((s: number, o: any) => s + (o.total ?? 0), 0);
  const savedCents = real.reduce((s: number, o: any) => s + (o.savedVsUberEatsCents ?? 0), 0);
  const first = real.map((o: any) => o.createdAt).sort((a: Date, b: Date) => a.getTime() - b.getTime())[0];
  console.log(JSON.stringify({
    restaurant: rest!.name,
    realOrders: real.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    savedVsAppsDollars: Math.round(savedCents / 100),
    since: first ? first.toISOString().slice(0, 10) : null,
  }));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
