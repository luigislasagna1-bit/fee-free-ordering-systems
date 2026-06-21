/**
 * Dev-only: seed the local demo restaurant with realistic orders so the
 * marketing screenshots (reports dashboard + kitchen app) show real data
 * instead of an empty "waiting for first order" state.
 *
 * Idempotent: orders are tagged with notes="__demo_seed__" and wiped + re-created
 * on each run. Run: npx tsx scripts/_seed-demo-orders.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const MARKER = "__demo_seed__";

async function main() {
  const demoUser = await prisma.user.findFirst({
    where: { email: "demo@feefreeordering.com" },
    select: { restaurantId: true, restaurant: { select: { name: true } } },
  });
  const restaurantId = demoUser?.restaurantId;
  if (!restaurantId) throw new Error("demo user / restaurant not found locally");

  const items = await prisma.menuItem.findMany({
    where: { restaurantId, isAvailable: true },
    select: { id: true, name: true, price: true },
    take: 14,
  });
  if (items.length === 0) throw new Error("demo restaurant has no available menu items");

  // Wipe prior seed orders (so re-runs don't pile up).
  const prior = await prisma.order.findMany({ where: { restaurantId, notes: MARKER }, select: { id: true } });
  if (prior.length) {
    const ids = prior.map((o) => o.id);
    await prisma.orderItem.deleteMany({ where: { orderId: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }

  const names = ["Sofia M.", "James T.", "Aisha K.", "Marco P.", "Liam O.", "Emma R.", "Noah B.", "Olivia S.", "Ethan W.", "Mia L.", "Lucas D.", "Ava C.", "Daniel F.", "Chloe N."];
  const types = ["pickup", "delivery", "dine_in"];
  let n = 0;

  const pick = (i: number) => items[((i % items.length) + items.length) % items.length];

  // ~16 completed/paid orders spread over the last 14 days → reports data.
  let completedCount = 0;
  for (let d = 0; d < 14; d++) {
    const perDay = 1 + ((d * 7 + 3) % 3); // 1–3 orders/day, deterministic
    for (let k = 0; k < perDay; k++) {
      const chosen = [pick(d + k), pick(d + k + 4), ...(k % 2 === 0 ? [pick(d + k + 8)] : [])];
      const orderItems = chosen.map((it) => ({ name: it.name, price: it.price, quantity: 1, subtotal: it.price, menuItemId: it.id }));
      const subtotal = +orderItems.reduce((s, i) => s + i.subtotal, 0).toFixed(2);
      const taxAmount = +(subtotal * 0.13).toFixed(2);
      const total = +(subtotal + taxAmount).toFixed(2);
      const when = new Date(Date.now() - d * 86400000 - k * 5400000 - 7200000);
      await prisma.order.create({
        data: {
          restaurantId, orderNumber: `D${1000 + n}`, status: "completed", type: types[n % 3],
          customerName: names[n % names.length], subtotal, taxAmount, total,
          paymentMethod: n % 4 === 0 ? "cash" : "card", paymentStatus: "paid", notes: MARKER,
          notifiedAt: when, createdAt: when,
          items: { create: orderItems },
        },
      });
      n++; completedCount++;
    }
  }

  // 2 fresh PAID pending orders → the kitchen app shows live incoming orders.
  for (let k = 0; k < 2; k++) {
    const chosen = [pick(k + 1), pick(k + 3), pick(k + 6)];
    const orderItems = chosen.map((it) => ({ name: it.name, price: it.price, quantity: 1 + (k % 2), subtotal: +(it.price * (1 + (k % 2))).toFixed(2), menuItemId: it.id }));
    const subtotal = +orderItems.reduce((s, i) => s + i.subtotal, 0).toFixed(2);
    const taxAmount = +(subtotal * 0.13).toFixed(2);
    const total = +(subtotal + taxAmount).toFixed(2);
    const when = new Date(Date.now() - k * 45000);
    await prisma.order.create({
      data: {
        restaurantId, orderNumber: `P${k + 1}`, status: "pending", type: types[k % 3],
        customerName: names[k], subtotal, taxAmount, total,
        paymentMethod: "card", paymentStatus: "paid", notes: MARKER,
        notifiedAt: when, createdAt: when,
        items: { create: orderItems },
      },
    });
  }

  console.log(`seeded ${completedCount} completed + 2 pending orders for "${demoUser?.restaurant?.name}"`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
