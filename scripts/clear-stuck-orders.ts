/**
 * Clear two specific orphaned test orders that are stuck in `pending` (since
 * May 23 / May 30) with notifiedAt = null AND alertAt = null, so the kitchen
 * auto-reject (which anchors on alertAt ?? notifiedAt) never clears them and
 * the alarm rings forever with no visible order.
 *
 * Direct DB status write (bypasses the reject API), so NO customer email /
 * refund side-effects fire. Targeted by exact orderNumber + a status:"pending"
 * guard so it can only ever touch these two if still pending.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/clear-stuck-orders.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { default: prisma } = await import("../src/lib/db");
  const restaurantId = "cmp7xhd3900000al2jz0db5vi"; // Luigi's real restaurant
  const stuck = ["ORD-246455079", "ORD-839828644"];

  const before = await prisma.order.findMany({
    where: { restaurantId, orderNumber: { in: stuck } },
    select: { orderNumber: true, status: true, createdAt: true, notifiedAt: true, alertAt: true },
  });
  console.log("BEFORE:", JSON.stringify(before, null, 2));

  const res = await prisma.order.updateMany({
    where: { restaurantId, orderNumber: { in: stuck }, status: "pending" },
    data: { status: "rejected" },
  });
  console.log(`Updated ${res.count} order(s) pending -> rejected.`);

  const after = await prisma.order.findMany({
    where: { restaurantId, orderNumber: { in: stuck } },
    select: { orderNumber: true, status: true },
  });
  console.log("AFTER:", JSON.stringify(after, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
