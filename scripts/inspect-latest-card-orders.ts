/**
 * Find the most recent card orders regardless of status.
 * Read-only.
 *
 * Run:
 *   npx tsx scripts/inspect-latest-card-orders.ts "<postgres-url>"
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: inspect-latest-card-orders.ts "<postgres-url>"');
    process.exit(1);
  }
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const orders = await prisma.order.findMany({
      where: { paymentMethod: "card" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentIntentId: true,
        refundStatus: true,
        total: true,
        rejectedAt: true,
        rejectionReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    console.log(`Last ${orders.length} card orders (newest first):\n`);
    for (const o of orders) {
      console.log(JSON.stringify(o, null, 2));
      console.log("---");
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
