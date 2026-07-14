/**
 * DEV-ONLY: seed a prepaid delivery order + queued FeeFree DeliveryAssignment on
 * the demo restaurant so the /driver flow has a job to work. Idempotent-ish:
 * reuses an existing un-terminal FeeFree delivery order if one is already seeded.
 *   npx tsx scripts/_seed-feefree-test.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) throw new Error("PROD url — dev-only script, aborting.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, lat: true, lng: true } });
  if (!r) throw new Error("demo-pizza-palace not found");

  const orderNumber = String(Date.now()).slice(-6);
  const order = await prisma.order.create({
    data: {
      restaurantId: r.id,
      orderNumber,
      status: "accepted",
      type: "delivery",
      customerName: "Test Customer",
      customerEmail: "test-customer@example.com",
      customerPhone: "+12895551234",
      deliveryAddress: "42 Maple Ave",
      deliveryCity: "Milton",
      deliveryZip: "L9T 2X5",
      deliveryLat: (r.lat ?? 43.5) + 0.01,
      deliveryLng: (r.lng ?? -79.9) + 0.01,
      notes: "Ring the bell twice",
      subtotal: 24.0,
      total: 27.99,
      tip: 4.0,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });

  const assignment = await prisma.deliveryAssignment.create({
    data: { orderId: order.id, restaurantId: r.id, status: "queued" },
    select: { id: true },
  });

  console.log(`✅ Seeded order #${order.orderNumber} (${order.id}) + queued assignment ${assignment.id}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
