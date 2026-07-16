/**
 * Remove the video-demo test delivery seeded for the Play declaration recording.
 * Deletes ONLY rows tagged with the videoseed customer email (assignment, items,
 * order) so nothing real is touched, and prints what it removed.
 *   npx tsx scripts/run-on-prod.ts scripts/_cleanup-video-test-delivery.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const SEED_EMAIL = "videoseed@demo.local";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const orders = await prisma.order.findMany({
    where: { customerEmail: SEED_EMAIL },
    select: { id: true, orderNumber: true, deliveryAssignment: { select: { id: true, status: true } } },
  });
  if (!orders.length) {
    console.log("nothing to clean — no videoseed orders found");
    await prisma.$disconnect();
    return;
  }
  const ids = orders.map((o) => o.id);
  await prisma.deliveryAssignment.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.order.deleteMany({ where: { id: { in: ids } } });
  for (const o of orders) console.log(`removed #${o.orderNumber} (assignment ${o.deliveryAssignment?.id ?? "none"}, was ${o.deliveryAssignment?.status ?? "-"})`);
  console.log(`✓ cleaned ${orders.length} video-demo order(s)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
