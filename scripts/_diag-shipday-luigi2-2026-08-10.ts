/**
 * READ-ONLY: bracket when ShipDay dispatch stopped for Luigi's live store —
 * last 5 orders WITH a shipdayOrderId, plus counts by day for the last 21 days.
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-shipday-luigi2-2026-08-10.ts
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

  const dispatched = await prisma.order.findMany({
    where: { restaurantId: RID, shipdayOrderId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { orderNumber: true, createdAt: true, status: true, dispatchedAt: true, shipdayOrderId: true, shipdayStatus: true },
  });
  console.log(`last ${dispatched.length} orders WITH shipdayOrderId:`);
  for (const o of dispatched) {
    console.log(`  #${o.orderNumber} created=${o.createdAt.toISOString()} status=${o.status} dispatchedAt=${o.dispatchedAt?.toISOString() ?? "-"} shipdayId=${o.shipdayOrderId} shipdayStatus=${o.shipdayStatus}`);
  }

  const since = new Date(Date.now() - 21 * 24 * 3600 * 1000);
  const all = await prisma.order.findMany({
    where: { restaurantId: RID, type: "delivery", createdAt: { gte: since } },
    select: { createdAt: true, shipdayOrderId: true, status: true },
  });
  const byDay = new Map<string, { total: number; dispatched: number }>();
  for (const o of all) {
    const day = o.createdAt.toISOString().slice(0, 10);
    const e = byDay.get(day) ?? { total: 0, dispatched: 0 };
    e.total++;
    if (o.shipdayOrderId) e.dispatched++;
    byDay.set(day, e);
  }
  console.log("delivery orders by day (created UTC): total / with-shipdayId");
  for (const [day, e] of [...byDay.entries()].sort()) {
    console.log(`  ${day}: ${e.total} / ${e.dispatched}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
