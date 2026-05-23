/**
 * Find the most recently cancelled card order — for verifying refund flow.
 * Read-only.
 *
 * Run:
 *   npx tsx scripts/inspect-latest-cancelled.ts "<postgres-url>"
 */
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: inspect-latest-cancelled.ts "<postgres-url>"');
    process.exit(1);
  }
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const orders = await prisma.order.findMany({
      where: {
        paymentMethod: "card",
        status: { in: ["cancelled", "rejected"] },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
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
      },
    });
    if (orders.length === 0) {
      console.log("No cancelled card orders found.");
      return;
    }
    console.log(`Last ${orders.length} cancelled/rejected card orders (newest first):\n`);
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
