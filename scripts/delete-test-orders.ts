/**
 * Delete every [TEST]-prefixed order on a specific restaurant. Use to
 * scrub a restaurant whose customer-data pages got polluted by an
 * earlier test seed run. Strict-scoped by --restaurant <slug> so it
 * can never reach into another restaurant's data by mistake.
 *
 * Deletes in this order to satisfy FK constraints:
 *   1. OrderItemModifier (FK → OrderItem)
 *   2. OrderItem         (FK → Order)
 *   3. Order             (the target rows)
 *
 * Usage (dry-run first, then add --apply):
 *   npx tsx scripts/delete-test-orders.ts --restaurant <slug> [--db-url <url>]
 *   npx tsx scripts/delete-test-orders.ts --restaurant <slug> --apply [--db-url <url>]
 *
 * Example:
 *   npx tsx scripts/delete-test-orders.ts \
 *     --restaurant luigis-lasagna-pizzeria --apply \
 *     --db-url "postgresql://...dawn-tree..."
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const restaurantSlug = getFlag("restaurant");
const explicitUrl = getFlag("db-url");
const apply = hasFlag("apply");

if (!restaurantSlug) {
  console.error(
    "Usage: npx tsx scripts/delete-test-orders.ts --restaurant <slug> [--apply] [--db-url <url>]\n\n" +
      "Without --apply, runs in dry-run mode and only reports counts.",
  );
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
  console.log(`Database:   ${masked}`);
  console.log(`Restaurant: ${restaurantSlug}`);
  console.log(`Mode:       ${apply ? "APPLY (will delete)" : "DRY-RUN (no changes)"}\n`);

  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: restaurantSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    console.error(`❌ No restaurant with slug="${restaurantSlug}"`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`Restaurant: ${restaurant.name} (id=${restaurant.id})\n`);

  // Find the target order IDs first so we can cascade-delete safely.
  const targets = await prisma.order.findMany({
    where: {
      restaurantId: restaurant.id,
      customerName: { startsWith: "[TEST]" },
    },
    select: { id: true, orderNumber: true, total: true, status: true, customerEmail: true, createdAt: true },
  });
  console.log(`Found ${targets.length} [TEST] orders on this restaurant.`);

  if (targets.length === 0) {
    console.log("Nothing to delete. Done.");
    await prisma.$disconnect();
    return;
  }

  // Per-email breakdown for a sanity check before the destructive call.
  const byEmail = new Map<string, number>();
  for (const o of targets) {
    const k = o.customerEmail ?? "(null)";
    byEmail.set(k, (byEmail.get(k) ?? 0) + 1);
  }
  console.log("Breakdown by customerEmail:");
  for (const [k, n] of [...byEmail.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)} × ${k}`);
  }
  console.log("");

  if (!apply) {
    console.log("DRY-RUN — no changes made. Re-run with --apply to delete.");
    await prisma.$disconnect();
    return;
  }

  const orderIds = targets.map((t) => t.id);
  const result = await prisma.$transaction(async (tx) => {
    // FK chain: OrderItemModifier → OrderItem → Order
    const items = await tx.orderItem.findMany({
      where: { orderId: { in: orderIds } },
      select: { id: true },
    });
    const itemIds = items.map((i) => i.id);
    const delMods = await tx.orderItemModifier.deleteMany({
      where: { orderItemId: { in: itemIds } },
    });
    const delItems = await tx.orderItem.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    // OrderRating has onDelete behavior; clear before deleting orders.
    const delRatings = await tx.orderRating.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    const delOrders = await tx.order.deleteMany({
      where: { id: { in: orderIds } },
    });
    return { delMods, delItems, delRatings, delOrders };
  });

  console.log(`✅ Deleted:`);
  console.log(`   OrderItemModifier: ${result.delMods.count}`);
  console.log(`   OrderItem:         ${result.delItems.count}`);
  console.log(`   OrderRating:       ${result.delRatings.count}`);
  console.log(`   Order:             ${result.delOrders.count}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
