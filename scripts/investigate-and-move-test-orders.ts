/**
 * Investigate why fabrx900@gmail.com has a Customer row on Luigi's,
 * then move any [TEST] orders that landed on Luigi's over to
 * Ristorante Test (restaurantId + customerId both rewritten).
 *
 * Usage:
 *   npx tsx scripts/investigate-and-move-test-orders.ts <email> <db-url>
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2];
const explicitUrl = process.argv[3];

if (!email) {
  console.error("Usage: npx tsx scripts/investigate-and-move-test-orders.ts <email> <db-url>");
  process.exit(1);
}
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) { console.error("No DATABASE_URL"); process.exit(1); }
  const masked = url.replace(/:[^:@]+@/, ":****@");
  console.log(`Database: ${masked}\n`);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // ── Customer rows for this email ────────────────────────────────────
  const customers = await prisma.customer.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      restaurantId: true,
      passwordHash: true,
      emailVerifiedAt: true,
      createdAt: true,
      totalOrders: true,
      totalSpent: true,
      lastOrderAt: true,
      restaurant: { select: { name: true, slug: true } },
    },
  });

  if (customers.length === 0) {
    console.log("No Customer rows found for that email.");
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${customers.length} Customer row(s):\n`);
  for (const c of customers) {
    console.log(`  ── ${c.restaurant.name} (${c.restaurant.slug})`);
    console.log(`     Customer id:   ${c.id}`);
    console.log(`     name:          ${c.name}`);
    console.log(`     phone:         ${c.phone ?? "(none)"}`);
    console.log(`     hasPassword:   ${c.passwordHash ? "yes" : "no"}`);
    console.log(`     emailVerified: ${c.emailVerifiedAt ? "yes" : "no"}`);
    console.log(`     created:       ${c.createdAt.toISOString()}`);
    console.log(`     totalOrders:   ${c.totalOrders}`);
    console.log(`     totalSpent:    $${c.totalSpent.toFixed(2)}`);
    console.log(`     lastOrderAt:   ${c.lastOrderAt?.toISOString() ?? "(none)"}`);

    // Per-customer orders breakdown
    const orderCount = await prisma.order.count({ where: { customerId: c.id } });
    const testOrderCount = await prisma.order.count({
      where: { customerId: c.id, customerName: { startsWith: "[TEST]" } },
    });
    const realOrderCount = orderCount - testOrderCount;
    console.log(`     total orders on this row:  ${orderCount}`);
    console.log(`     of those, [TEST] orders:    ${testOrderCount}`);
    console.log(`     of those, real orders:      ${realOrderCount}`);

    if (realOrderCount > 0) {
      console.log("     ↪ sample of the real (non-TEST) orders:");
      const realSample = await prisma.order.findMany({
        where: {
          customerId: c.id,
          customerName: { not: { startsWith: "[TEST]" } },
        },
        select: {
          orderNumber: true,
          customerName: true,
          createdAt: true,
          total: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      for (const o of realSample) {
        console.log(
          `        • ${o.orderNumber}  ${o.createdAt.toISOString()}  $${o.total.toFixed(2)}  ${o.status}  by "${o.customerName}"`,
        );
      }
    }
    console.log("");
  }

  // ── Identify Ristorante Test customer (the canonical one) ───────────
  const ristoCustomer = customers.find((c) => c.restaurant.slug === "ristorante-test");
  const luigisCustomer = customers.find((c) => c.restaurant.slug === "luigis-lasagna-pizzeria");

  if (!ristoCustomer) {
    console.error("❌ No Customer row on ristorante-test. Cannot move orders.");
    await prisma.$disconnect();
    return;
  }
  if (!luigisCustomer) {
    console.log("✅ No Customer row on luigis-lasagna-pizzeria. Nothing to move.");
    await prisma.$disconnect();
    return;
  }

  console.log(`──────────────────────────────────────────────────────────`);
  console.log(`Action plan:`);
  console.log(`  - Move every [TEST] order currently on Luigi's`);
  console.log(`    (customerId=${luigisCustomer.id})`);
  console.log(`  - To Ristorante Test`);
  console.log(`    (customerId=${ristoCustomer.id}, restaurantId=${ristoCustomer.restaurantId})`);
  console.log(``);

  // Pre-count what we're about to move
  const movingCount = await prisma.order.count({
    where: {
      customerId: luigisCustomer.id,
      customerName: { startsWith: "[TEST]" },
    },
  });
  console.log(`  [TEST] orders to move: ${movingCount}`);
  if (movingCount === 0) {
    console.log(`  Nothing to move.\n`);
    await prisma.$disconnect();
    return;
  }

  // The Order's items reference menuItemId on Luigi's menu. After the
  // move those FK references would be stale (Ristorante Test has
  // different MenuItem ids), so the receipt-replay / "Order again"
  // rail could break. To keep the cross-restaurant move clean we
  // null-out menuItemId / variantId on the moved order's items — the
  // name + price snapshot on OrderItem keeps the receipt intact.
  console.log(``);
  console.log(`Executing move…`);
  const result = await prisma.$transaction(async (tx) => {
    // 1) Re-parent orders
    const orderUpd = await tx.order.updateMany({
      where: {
        customerId: luigisCustomer.id,
        customerName: { startsWith: "[TEST]" },
      },
      data: {
        customerId: ristoCustomer.id,
        restaurantId: ristoCustomer.restaurantId,
      },
    });
    // 2) For those orders, null-out cross-restaurant menu-item FKs so
    //    the items don't point at Luigi's menu rows from a Ristorante
    //    Test order. The name+price snapshot stays intact.
    const movedOrderIds = await tx.order.findMany({
      where: {
        customerId: ristoCustomer.id,
        restaurantId: ristoCustomer.restaurantId,
        customerName: { startsWith: "[TEST]" },
      },
      select: { id: true },
    });
    const itemUpd = await tx.orderItem.updateMany({
      where: { orderId: { in: movedOrderIds.map((o) => o.id) } },
      data: { menuItemId: null, variantId: null },
    });
    return { orderUpd, itemUpd };
  });

  console.log(`✅ Moved ${result.orderUpd.count} orders.`);
  console.log(`   Nulled cross-restaurant menuItemId/variantId on ${result.itemUpd.count} order items.`);

  // ── After moving — should the Luigi's Customer row be deleted? ──────
  const remainingOnLuigis = await prisma.order.count({
    where: { customerId: luigisCustomer.id },
  });
  console.log(``);
  if (remainingOnLuigis === 0) {
    console.log(
      `Luigi's Customer row (id=${luigisCustomer.id}) now has 0 orders.\n` +
        `It is safe to delete this Customer row. NOT deleted automatically — re-run with --delete-empty-luigis to remove it.`,
    );
    if (process.argv.includes("--delete-empty-luigis")) {
      // Resync the loyaltyVisit FK chain just in case
      const visits = await prisma.loyaltyVisit.deleteMany({
        where: { customerId: luigisCustomer.id },
      });
      const addresses = await prisma.savedAddress.deleteMany({
        where: { customerId: luigisCustomer.id },
      });
      const del = await prisma.customer.delete({ where: { id: luigisCustomer.id } });
      console.log(
        `   Deleted ${visits.count} loyalty visit(s), ${addresses.count} saved address(es), and the Customer row itself.`,
      );
    }
  } else {
    console.log(
      `Luigi's Customer row still has ${remainingOnLuigis} non-TEST order(s) — leaving it in place.`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
