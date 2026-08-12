/** READ-ONLY: order 710341102 — customer says confirmed at 4:21, store never got it. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const J = (o: unknown) => JSON.stringify(o, (_k, v) => (v instanceof Date ? v.toISOString() : v));

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`now=${new Date().toISOString()}`);

  const o = await prisma.order.findFirst({
    where: { orderNumber: { contains: "710341102" } },
    select: {
      id: true, orderNumber: true, restaurantId: true, status: true, type: true,
      createdAt: true, updatedAt: true, acceptedAt: true, notifiedAt: true, alertAt: true,
      alertCallAt: true, rejectedAt: true, rejectionReason: true, cancelledBy: true,
      completedAt: true, kitchenPrintedAt: true,
      paymentMethod: true, paymentStatus: true, paymentIntentId: true,
      paypalOrderId: true, paypalCaptureId: true,
      scheduledFor: true, estimatedReady: true, preparationTime: true,
      placedWhileClosed: true, customerName: true, customerEmail: true, customerPhone: true,
      customerLocale: true, customerId: true, total: true, subtotal: true, creditApplied: true,
      deliveryAddress: true, viaMarketplace: true, idempotencyKey: true,
    },
  });
  console.log("ORDER " + J(o));

  if (!o) {
    // Maybe the number the customer read is formatted differently — sweep today's orders.
    const since = new Date(Date.now() - 48 * 3600_000);
    const all = await prisma.order.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { orderNumber: true, restaurantId: true, status: true, createdAt: true, notifiedAt: true, paymentStatus: true, customerName: true, total: true },
    });
    for (const r of all) console.log("ANY48H " + J(r));
    await prisma.$disconnect();
    return;
  }

  const r = await prisma.restaurant.findUnique({
    where: { id: o.restaurantId },
    select: {
      id: true, name: true, slug: true, timezone: true, email: true,
      autoAcceptOrders: true, kitchenWorkflowMode: true,
      customerEmailOrderConfirm: true,
    } as any,
  });
  console.log("RESTAURANT " + J(r));

  const recips = await prisma.notificationRecipient.findMany({
    where: { restaurantId: o.restaurantId },
    select: { id: true, email: true, isActive: true, orderPlaced: true, orderAccepted: true, pickupConfirmed: true } as any,
  }).catch((e: unknown) => { console.log("RECIP_ERR " + String(e)); return []; });
  for (const x of recips as any[]) console.log("RECIPIENT " + J(x));

  const items = await prisma.orderItem.findMany({
    where: { orderId: o.id },
    select: { id: true, name: true, quantity: true, price: true },
  });
  for (const it of items) console.log("ITEM " + J(it));

  // Neighbours: what else did this store take around the same time, and did THEY notify?
  const from = new Date(o.createdAt.getTime() - 6 * 3600_000);
  const to = new Date(o.createdAt.getTime() + 6 * 3600_000);
  const near = await prisma.order.findMany({
    where: { restaurantId: o.restaurantId, createdAt: { gte: from, lte: to } },
    orderBy: { createdAt: "asc" },
    select: {
      orderNumber: true, status: true, createdAt: true, notifiedAt: true, acceptedAt: true,
      alertAt: true, paymentMethod: true, paymentStatus: true, type: true, total: true,
      kitchenPrintedAt: true, customerName: true,
    },
  });
  for (const n of near) console.log("NEAR " + J(n));

  // Any print attempt logged?
  const prints = await prisma.printLog.findMany({
    where: { orderId: o.id },
    select: { id: true, status: true, createdAt: true, error: true } as any,
  }).catch(() => []);
  for (const p of prints as any[]) console.log("PRINT " + J(p));

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
