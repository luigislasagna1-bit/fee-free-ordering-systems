/**
 * One-off cleanup for a stuck-abandoned order. Marks the given order
 * "cancelled" with a sensible reason. Use ONLY for orders that you've
 * verified are genuinely abandoned (paymentStatus: pending,
 * notifiedAt: null, no money taken) — this script doesn't touch
 * Stripe / PayPal, so DON'T use it on paid orders.
 *
 * Usage:
 *   npx tsx scripts/dev-cancel-abandoned-order.ts <orderNumberOrId> [database-url]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const key = process.argv[2];
  const url = process.argv[3] ?? process.env.DATABASE_URL;
  if (!key || !url) {
    console.error("Usage: npx tsx scripts/dev-cancel-abandoned-order.ts <orderNumberOrId> [url]");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: key }, { orderNumber: key }] },
    select: { id: true, orderNumber: true, status: true, paymentStatus: true, notifiedAt: true },
  });
  if (!order) { console.error(`Order not found: ${key}`); process.exit(1); }

  if (order.status !== "pending" || order.paymentStatus !== "pending" || order.notifiedAt !== null) {
    console.error(`Refusing to touch ${order.orderNumber}: not in abandoned state (status=${order.status}, paymentStatus=${order.paymentStatus}, notifiedAt=${order.notifiedAt ?? "null"})`);
    process.exit(1);
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: "cancelled",
      rejectedAt: new Date(),
      rejectionReason: "Payment was not completed within the checkout window. The order was cancelled automatically.",
    },
  });
  console.log(`Cancelled ${order.orderNumber}.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
