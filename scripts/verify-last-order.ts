/**
 * Pulls the most recent Order with its payment metadata to confirm the
 * customer-side smoke test landed correctly. Read-only.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const url = process.argv[2];
if (!url) { console.error("Usage: npx tsx scripts/verify-last-order.ts <db-url>"); process.exit(1); }

async function main() {
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const order = await prisma.order.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      restaurant: { select: { name: true, slug: true, stripeAccountId: true } },
      items: { include: { modifiers: true } },
    },
  });

  if (!order) {
    console.log("No orders found.");
    return;
  }

  console.log("Most recent order:");
  console.log(`  ID:              ${order.id}`);
  console.log(`  Order number:    ${order.orderNumber}`);
  console.log(`  Restaurant:      ${order.restaurant.name} (${order.restaurant.slug})`);
  console.log(`  Connect account: ${order.restaurant.stripeAccountId ?? "(none)"}`);
  console.log(`  Customer:        ${order.customerName} <${order.customerEmail}>`);
  console.log(`  Service:         ${order.orderType}`);
  console.log(`  Total:           $${order.total.toFixed(2)}`);
  console.log(`  Subtotal:        $${order.subtotal.toFixed(2)}`);
  console.log(`  Tax:             $${(order.tax ?? 0).toFixed(2)}`);
  console.log(`  Tip:             $${(order.tip ?? 0).toFixed(2)}`);
  console.log(`  Status:          ${order.status}`);
  console.log(`  Payment method:  ${order.paymentMethod ?? "(none)"}`);
  console.log(`  Payment status:  ${(order as any).paymentStatus ?? "(n/a)"}`);
  console.log(`  Stripe PI:       ${(order as any).stripePaymentIntentId ?? "(none)"}`);
  console.log(`  Created:         ${order.createdAt.toISOString()}`);
  console.log("");
  console.log(`  Items (${order.items.length}):`);
  for (const it of order.items) {
    console.log(`    ${it.quantity}x ${it.itemName.padEnd(30)} $${it.totalPrice.toFixed(2)}`);
  }

  // Quick fee math
  const totalCents = Math.round(order.total * 100);
  const platformFee = Math.round(totalCents * 0.029) + 30; // 2.9% + $0.30
  console.log("");
  console.log("Destination-charge split (expected):");
  console.log(`  Customer paid:            $${(totalCents / 100).toFixed(2)}`);
  console.log(`  Stripe processing fee:    ~$${((Math.round(totalCents * 0.029) + 30) / 100).toFixed(2)}  (paid by restaurant)`);
  console.log(`  Platform application fee: $${(platformFee / 100).toFixed(2)}  (our cut)`);
  console.log(`  Net to restaurant:        ~$${((totalCents - platformFee) / 100).toFixed(2)}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
