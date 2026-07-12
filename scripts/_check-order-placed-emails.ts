/**
 * Order-placed staff email check (READ-ONLY): does Luigi's restaurant have
 * NotificationRecipient rows with the orderPlaced toggle on, and did recent
 * orders get their notifiedAt claim stamped promptly?
 *   npx tsx scripts/run-on-prod.ts scripts/_check-order-placed-emails.ts
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

  const restaurants = await prisma.restaurant.findMany({
    where: { name: { contains: "Luigi", mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
    take: 5,
  });

  for (const r of restaurants) {
    console.log(`\n=== ${r.name} (${r.slug}) [${r.id}] ===`);

    const recipients = await prisma.notificationRecipient.findMany({
      where: { restaurantId: r.id },
      select: {
        email: true, name: true, isActive: true, emailLanguage: true,
        orderPlaced: true, deliveryConfirmed: true, pickupConfirmed: true,
        orderRejected: true, endOfDayReport: true, createdAt: true,
      },
    });
    console.log(`NotificationRecipients (${recipients.length}):`);
    for (const n of recipients) {
      console.log(
        `  ${n.email.padEnd(36)} active=${n.isActive} orderPlaced=${n.orderPlaced} ` +
        `delivConf=${n.deliveryConfirmed} pickupConf=${n.pickupConfirmed} lang=${n.emailLanguage} created=${n.createdAt.toISOString()}`
      );
    }
    if (recipients.length === 0) {
      console.log("  (NONE — no staff emails can fire for this restaurant)");
    }

    const since = new Date(Date.now() - 3 * 24 * 3600 * 1000);
    const orders = await prisma.order.findMany({
      where: { restaurantId: r.id, createdAt: { gte: since } },
      select: {
        orderNumber: true, createdAt: true, notifiedAt: true, status: true,
        paymentMethod: true, paymentStatus: true, isTestOrder: true,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    console.log(`Orders in the last 3 days (${orders.length}):`);
    for (const o of orders) {
      const lagSec = o.notifiedAt ? Math.round((o.notifiedAt.getTime() - o.createdAt.getTime()) / 1000) : null;
      console.log(
        `  ${o.orderNumber.padEnd(16)} created=${o.createdAt.toISOString()} notifiedAt=${o.notifiedAt?.toISOString() ?? "NULL (never fired!)"} ` +
        `lag=${lagSec === null ? "-" : lagSec + "s"} status=${o.status} pay=${o.paymentMethod}/${o.paymentStatus} test=${o.isTestOrder}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
