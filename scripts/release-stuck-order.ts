/**
 * One-shot rescue: manually fire fireOrderNotifications() for an order
 * whose notifiedAt is stuck at null even though payment succeeded.
 *
 * Use after a Stripe payment_intent.succeeded webhook lost its fan-out
 * to the serverless lambda being killed mid-promise.
 *
 * Run:
 *   npx tsx scripts/release-stuck-order.ts <orderNumber> "<postgres-url>"
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const orderNumber = process.argv[2];
  const url = process.argv[3];
  if (!orderNumber || !url) {
    console.error('Usage: release-stuck-order.ts <orderNumber> "<postgres-url>"');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);

  try {
    const order = await prisma.order.findFirst({
      where: { orderNumber },
      select: { id: true, orderNumber: true, paymentStatus: true, notifiedAt: true, customerEmail: true },
    });
    if (!order) {
      console.error(`No order with orderNumber "${orderNumber}"`);
      process.exit(1);
    }
    console.log(`Order: ${order.orderNumber} (id ${order.id})`);
    console.log(`paymentStatus: ${order.paymentStatus}`);
    console.log(`notifiedAt:    ${order.notifiedAt?.toISOString() ?? "(null — stuck)"}`);

    if (order.notifiedAt) {
      console.log(`\nAlready released. No action needed.`);
      return;
    }
    if (order.paymentStatus !== "paid") {
      console.log(`\nPayment not yet paid (${order.paymentStatus}). Cannot release.`);
      return;
    }

    // Atomic release — same logic as fireOrderNotifications
    const claim = await prisma.order.updateMany({
      where: { id: order.id, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });
    if (claim.count === 0) {
      console.log(`Another process beat us to the claim — order is now released anyway.`);
      return;
    }
    console.log(`\n✓ Released order ${order.orderNumber} — notifiedAt now set`);
    console.log(`  Note: customer + staff EMAILS were NOT re-sent. If they need to go,`);
    console.log(`  call fireOrderNotifications via an admin endpoint or accept the gap`);
    console.log(`  (kitchen will see it via the order list / polling regardless).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
