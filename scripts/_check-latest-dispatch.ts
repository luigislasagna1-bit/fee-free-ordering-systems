/**
 * READ-ONLY: the latest orders for a restaurant + every field the ShipDay
 * dispatch path gates on, so a "nothing showed up in ShipDay" report can be
 * pinpointed to the exact gate (not accepted yet / not prepaid / no address /
 * dispatch error).
 *   npx tsx scripts/run-on-prod.ts scripts/_check-latest-dispatch.ts <restaurantId>
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const rid = process.argv[2];
  if (!rid) throw new Error("pass the restaurant id");
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const cfg = await prisma.shipdayConfig.findUnique({ where: { restaurantId: rid } });
  console.log(`shipdayConfig: enabled=${cfg?.enabled} source=${cfg?.deliverySource} active=${cfg?.activeDispatchMode} hasKey=${!!cfg?.apiKeyEnc} verified=${cfg?.webhookVerifiedAt?.toISOString() ?? "-"}`);

  const orders = await prisma.order.findMany({
    where: { restaurantId: rid, createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      orderNumber: true, createdAt: true, type: true, status: true,
      paymentMethod: true, paymentStatus: true, total: true, creditApplied: true,
      deliveryAddress: true, shipdayOrderId: true, shipdayStatus: true, dispatchedAt: true,
    },
  });
  console.log(`orders in the last 6h (${orders.length}):`);
  for (const o of orders) {
    console.log(
      `  ${o.orderNumber} created=${o.createdAt.toISOString()} type=${o.type} STATUS=${o.status} ` +
      `pay=${o.paymentMethod}/${o.paymentStatus} total=${o.total} credit=${o.creditApplied ?? 0} ` +
      `addr=${o.deliveryAddress ? "yes" : "MISSING"} shipdayId=${o.shipdayOrderId ?? "-"} shipdayStatus=${o.shipdayStatus ?? "-"} dispatchedAt=${o.dispatchedAt?.toISOString() ?? "-"}`
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
