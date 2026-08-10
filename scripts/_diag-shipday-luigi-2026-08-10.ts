/**
 * READ-ONLY: why aren't Luigi's new delivery orders reaching ShipDay?
 * Prints, for luigis-lasagna-pizzeria: the resolved delivery provider inputs
 * (ShipdayConfig incl. activeDispatchMode, FeeFreeDeliveryConfig) and the
 * last 7 days of delivery orders with every field the dispatch guards read.
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-shipday-luigi-2026-08-10.ts
 */
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

  const r = await prisma.restaurant.findFirst({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: { id: true, name: true, slug: true, lat: true, lng: true },
  });
  if (!r) { console.log("restaurant not found"); return; }
  console.log(`=== ${r.name} (${r.slug}) id=${r.id} lat/lng=${r.lat},${r.lng} ===`);

  const sd = await prisma.shipdayConfig.findUnique({ where: { restaurantId: r.id } });
  console.log(`shipdayConfig: enabled=${sd?.enabled} source=${sd?.deliverySource} activeDispatchMode=${sd?.activeDispatchMode} hasKey=${!!sd?.apiKeyEnc} verified=${sd?.webhookVerifiedAt?.toISOString() ?? "-"}`);

  const ff = await prisma.feeFreeDeliveryConfig.findUnique({ where: { restaurantId: r.id } });
  console.log(ff
    ? `feeFreeDeliveryConfig: enabled=${ff.enabled} autoSend=${(ff as any).autoSend}`
    : "feeFreeDeliveryConfig: (no row)");

  const orders = await prisma.order.findMany({
    where: { restaurantId: r.id, type: "delivery", createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      orderNumber: true, createdAt: true, status: true,
      paymentMethod: true, paymentStatus: true, total: true, creditApplied: true,
      deliveryAddress: true, shipdayOrderId: true, shipdayStatus: true, dispatchedAt: true,
      deliveryAssignment: { select: { id: true, status: true, createdAt: true } },
    },
  });
  console.log(`delivery orders in the last 7d (${orders.length}):`);
  for (const o of orders) {
    console.log(
      `  #${o.orderNumber} created=${o.createdAt.toISOString()} STATUS=${o.status} ` +
      `pay=${o.paymentMethod}/${o.paymentStatus} total=${o.total} credit=${o.creditApplied ?? 0} ` +
      `addr=${o.deliveryAddress ? "yes" : "MISSING"} shipdayId=${o.shipdayOrderId ?? "-"} shipdayStatus=${o.shipdayStatus ?? "-"} ` +
      `dispatchedAt=${o.dispatchedAt?.toISOString() ?? "-"} ffAssignment=${o.deliveryAssignment ? `${o.deliveryAssignment.status}@${o.deliveryAssignment.createdAt.toISOString()}` : "-"}`
    );
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
