/**
 * Look up a specific order by Stripe paymentIntentId on a given branch.
 * Read-only — for debugging refund flows.
 *
 * Run:
 *   npx tsx scripts/inspect-order-by-pi.ts "<postgres-url>" <paymentIntentId>
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const url = process.argv[2];
  const pi = process.argv[3];
  if (!url || !pi) {
    console.error('Usage: inspect-order-by-pi.ts "<postgres-url>" <pi_xxx>');
    process.exit(1);
  }
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const orders = await prisma.order.findMany({
      where: { paymentIntentId: pi },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentIntentId: true,
        refundStatus: true,
        paymentMethod: true,
        total: true,
        notifiedAt: true,
        acceptedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
        viaMarketplace: true,
      },
    });
    if (orders.length === 0) {
      console.log(`No orders found with paymentIntentId=${pi}`);
      return;
    }
    for (const o of orders) {
      console.log(JSON.stringify(o, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
