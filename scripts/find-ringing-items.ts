/**
 * READ-ONLY diagnostic: find what's making Luigi's kitchen alarm ring.
 * Finds the restaurant via the OWNER LOGIN (luigislasagna1@gmail.com) to be sure
 * it's the real live account, then lists pending orders + reservations + recent
 * order timing. Touches nothing.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/find-ringing-items.ts
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { default: prisma } = await import("../src/lib/db");

  // The REAL live restaurant (201 orders, info@luigislasagna.com) — the other
  // "Lasagna" record is an old test with 4 orders.
  const restaurantId = "cmp7xhd3900000al2jz0db5vi";

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, slug: true, email: true, _count: { select: { orders: true } } },
  });
  console.log("Restaurant:", JSON.stringify(restaurant));

  const pendingOrders = await prisma.order.findMany({
    where: { restaurantId, status: "pending" },
    select: {
      orderNumber: true, status: true, placedWhileClosed: true,
      createdAt: true, notifiedAt: true, alertAt: true, scheduledFor: true, customerName: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  console.log(`\n=== PENDING ORDERS: ${pendingOrders.length} ===`);
  for (const o of pendingOrders) {
    const c = new Date(o.createdAt).getTime();
    const a = (o as any).alertAt ? new Date((o as any).alertAt).getTime() : null;
    console.log(JSON.stringify({ ...o, secsAlertFromCreate: a ? Math.round((a - c) / 1000) : null }));
  }

  const pendingRes = await prisma.reservation.findMany({
    where: { restaurantId, status: "pending" },
    select: { id: true, status: true, date: true, time: true, alertAt: true, depositAmount: true, customerName: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  console.log(`\n=== PENDING RESERVATIONS: ${pendingRes.length} ===`);
  for (const r of pendingRes) console.log(JSON.stringify(r));

  const recent = await prisma.order.findMany({
    where: { restaurantId },
    select: { orderNumber: true, status: true, placedWhileClosed: true, createdAt: true, notifiedAt: true, alertAt: true, scheduledFor: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  console.log(`\n=== RECENT ORDERS: ${recent.length} ===`);
  for (const o of recent) {
    const c = new Date(o.createdAt).getTime();
    const a = (o as any).alertAt ? new Date((o as any).alertAt).getTime() : null;
    console.log(JSON.stringify({ ...o, secsAlertFromCreate: a ? Math.round((a - c) / 1000) : null }));
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
