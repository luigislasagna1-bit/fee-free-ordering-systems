/**
 * READ-ONLY: is auto-accept the reason ShipDay dispatch stopped?
 * Prints restaurant.autoAcceptOrders + createdAt vs acceptedAt for the last
 * 14 days of delivery orders (acceptedAt ≈ createdAt ⇒ auto-accepted, so the
 * kitchen accept PATCH — the only ShipDay dispatch trigger — never fired).
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-shipday-luigi3-2026-08-10.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const RID = "cmp7xhd3900000al2jz0db5vi";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findUnique({
    where: { id: RID },
    select: { autoAcceptOrders: true },
  });
  console.log(`autoAcceptOrders=${r?.autoAcceptOrders}`);

  const orders = await prisma.order.findMany({
    where: { restaurantId: RID, type: "delivery", createdAt: { gte: new Date(Date.now() - 14 * 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { orderNumber: true, createdAt: true, acceptedAt: true, status: true, shipdayOrderId: true },
  });
  console.log("order / created / accepted-after-seconds / dispatched:");
  for (const o of orders) {
    const gap = o.acceptedAt ? Math.round((o.acceptedAt.getTime() - o.createdAt.getTime()) / 1000) : null;
    console.log(`  #${o.orderNumber} ${o.createdAt.toISOString()} acceptGap=${gap === null ? "-" : gap + "s"} status=${o.status} shipday=${o.shipdayOrderId ? "YES" : "no"}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
