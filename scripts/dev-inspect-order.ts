/**
 * Inspect a single Order to debug promo application. Pass the order
 * number or order id. Includes prior server-side state so we can spot
 * exactly where a promo dropped out.
 *
 * Usage:
 *   npx tsx scripts/dev-inspect-order.ts <orderNumberOrId> [database-url]
 *
 * Examples:
 *   npx tsx scripts/dev-inspect-order.ts ORD-432687002
 *   npx tsx scripts/dev-inspect-order.ts cmprotaj4000704l40mjd1yx5 \
 *     "postgresql://...dawn-tree..."
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const key = process.argv[2];
  const url = process.argv[3] ?? process.env.DATABASE_URL;
  if (!key) {
    console.error("Usage: npx tsx scripts/dev-inspect-order.ts <orderNumberOrId> [database-url]");
    process.exit(1);
  }
  if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const order = await prisma.order.findFirst({
    where: { OR: [{ id: key }, { orderNumber: key }] },
  });
  if (!order) { console.error(`Order not found: ${key}`); process.exit(1); }

  console.log(`\nOrder: ${order.orderNumber}`);
  console.log(`  id:               ${order.id}`);
  console.log(`  status:           ${order.status}`);
  console.log(`  type:             ${order.type}`);
  console.log(`  createdAt:        ${order.createdAt.toISOString()}`);
  console.log(`  notifiedAt:       ${order.notifiedAt?.toISOString() ?? "(null)"}`);
  console.log(`  paymentMethod:    ${order.paymentMethod}`);
  console.log(`  paymentStatus:    ${order.paymentStatus}`);
  console.log(`  subtotal:         $${order.subtotal.toFixed(2)}`);
  console.log(`  couponDiscount:   $${order.couponDiscount.toFixed(2)}`);
  console.log(`  promoDiscount:    $${order.promoDiscount.toFixed(2)}`);
  console.log(`  deliveryFee:      $${order.deliveryFee.toFixed(2)}`);
  console.log(`  taxAmount:        $${order.taxAmount.toFixed(2)}`);
  console.log(`  tip:              $${order.tip.toFixed(2)}`);
  console.log(`  total:            $${order.total.toFixed(2)}`);
  console.log(`  couponId:         ${order.couponId ?? "(null)"}`);
  console.log(`  appliedPromos:    ${order.appliedPromos ?? "(null)"}`);
  console.log(`  notes:            ${order.notes ?? "(none)"}`);
  console.log();

  if (order.appliedPromos) {
    try {
      const promos = JSON.parse(order.appliedPromos);
      console.log("Parsed appliedPromos:");
      console.log(JSON.stringify(promos, null, 2));
    } catch (e) {
      console.error("appliedPromos JSON parse error:", e);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
