/**
 * Seed ONE delivery order + queued FeeFree assignment on the DEMO restaurant so
 * the driver app has a live job to record for the Play Store declaration video.
 * Prod-safe by design: writes only to the fee-free-demo-restaurant, idempotent
 * (reuses an existing queued video-seed if present), prints the customer
 * tracking URL for the recording.
 *   npx tsx scripts/run-on-prod.ts scripts/_seed-video-test-delivery.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const SEED_EMAIL = "videoseed@demo.local";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({
    where: { slug: "fee-free-demo-restaurant" },
    select: { id: true, slug: true, lat: true, lng: true },
  });
  if (!r) throw new Error("fee-free-demo-restaurant not found");

  // Reuse a still-live video-seed job if one exists (idempotent re-runs).
  const existing = await prisma.deliveryAssignment.findFirst({
    where: { restaurantId: r.id, status: "queued", order: { customerEmail: SEED_EMAIL } },
    select: { id: true, orderId: true, order: { select: { orderNumber: true } } },
  });
  if (existing) {
    console.log(`✓ reusing queued video-seed job #${existing.order.orderNumber}`);
    console.log(`ORDER_ID ${existing.orderId}`);
    console.log(`TRACKING https://feefreeordering.com/order/${r.slug}/status/${existing.orderId}`);
    await prisma.$disconnect();
    return;
  }

  const orderNumber = String(Date.now()).slice(-6);
  const order = await prisma.order.create({
    data: {
      restaurantId: r.id,
      orderNumber,
      status: "accepted",
      type: "delivery",
      customerName: "Alex P.",
      customerEmail: SEED_EMAIL,
      customerPhone: "+14165550137",
      deliveryAddress: "128 Bronte St S",
      deliveryCity: "Milton",
      deliveryZip: "L9T 1Y9",
      deliveryLat: (r.lat ?? 43.5183) + 0.015,
      deliveryLng: (r.lng ?? -79.8774) - 0.008,
      notes: "Please ring the bell",
      subtotal: 27.5,
      total: 31.08,
      tip: 4.5,
      paymentStatus: "paid",
      paymentMethod: "card",
    },
    select: { id: true, orderNumber: true },
  });
  const asg = await prisma.deliveryAssignment.create({
    data: { orderId: order.id, restaurantId: r.id, status: "queued" },
    select: { id: true },
  });
  console.log(`✓ seeded video test delivery #${order.orderNumber} (assignment ${asg.id})`);
  console.log(`ORDER_ID ${order.id}`);
  console.log(`TRACKING https://feefreeordering.com/order/${r.slug}/status/${order.id}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
