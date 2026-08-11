/** READ-ONLY: why did an auto-accept store send "awaiting confirmation"? */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`now=${new Date().toISOString()}`);

  const rs = await prisma.restaurant.findMany({
    where: { name: { contains: "Luigi", mode: "insensitive" } },
    select: {
      id: true, name: true, slug: true, autoAcceptOrders: true,
      kitchenWorkflowMode: true, customerEmailOrderConfirm: true,
      estimatedPickup: true, estimatedDelivery: true, timezone: true,
    },
  });
  for (const r of rs) console.log("RESTAURANT " + JSON.stringify(r));

  const o = await prisma.order.findFirst({
    where: { orderNumber: "ORD-143921044" },
    select: {
      id: true, orderNumber: true, restaurantId: true, status: true,
      createdAt: true, acceptedAt: true, notifiedAt: true, alertAt: true,
      paymentMethod: true, paymentStatus: true, type: true,
      scheduledFor: true, estimatedReady: true, preparationTime: true,
      placedWhileClosed: true, customerEmail: true, total: true,
      customerLocale: true,
    },
  });
  console.log("ORDER " + JSON.stringify(o, (_k, v) => (v instanceof Date ? v.toISOString() : v)));

  // Every order this store took today — did ANY of them get accepted at create?
  const since = new Date(Date.now() - 36 * 3600_000);
  const recent = await prisma.order.findMany({
    where: { createdAt: { gte: since }, restaurantId: o?.restaurantId ?? undefined },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      orderNumber: true, status: true, createdAt: true, acceptedAt: true,
      notifiedAt: true, paymentMethod: true, paymentStatus: true, type: true,
    },
  });
  for (const r of recent) {
    console.log("RECENT " + JSON.stringify(r, (_k, v) => (v instanceof Date ? v.toISOString() : v)));
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
