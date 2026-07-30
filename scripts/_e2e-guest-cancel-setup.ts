/**
 * Dev-only E2E fixture for the guest self-cancel flow (Fabrizio cms0idtz7).
 *
 * Creates in the DEV database for the demo restaurant:
 *   1. A pending CASH order stamped placedWhileClosed=true + alertAt (the
 *      closed-hours case the feature is for)
 *   2. A pending walk-up reservation (tomorrow, no deposit, no orderId)
 *
 * Prints the guest cancel URLs (with real signed tokens) + a tampered-token
 * URL and a wrong-purpose-token URL for the negative tests.
 *
 *   npx tsx scripts/_e2e-guest-cancel-setup.ts
 */
import prisma from "../src/lib/db";
import { signActionToken } from "../src/lib/order-status-token";

async function main() {
  const r = await prisma.restaurant.findUnique({
    where: { slug: "demo-pizza-palace" },
    select: { id: true, slug: true, currency: true },
  });
  if (!r) throw new Error("demo-pizza-palace not found — run the demo seed first");

  const item = await prisma.menuItem.findFirst({
    where: { restaurantId: r.id, isAvailable: true },
    select: { id: true, name: true, price: true },
  });
  if (!item) throw new Error("no menu item on demo restaurant");

  // Reuse an earlier fixture pair if a failed run left one behind.
  const existingOrder = await prisma.order.findFirst({
    where: { restaurantId: r.id, customerEmail: "guest-cancel-e2e@example.com", status: "pending" },
    select: { id: true, orderNumber: true },
  });
  const orderNumber = `E2E${Date.now().toString().slice(-6)}`;
  const alertAt = new Date(Date.now() + 60 * 60 * 1000); // "opens" in 1h — parked
  const order = existingOrder ?? await prisma.order.create({
    data: {
      restaurantId: r.id,
      orderNumber,
      customerName: "[TEST] Guest Cancel E2E",
      customerEmail: "guest-cancel-e2e@example.com",
      customerPhone: "+15550100200",
      type: "pickup",
      status: "pending",
      paymentMethod: "cash",
      paymentStatus: "pending",
      subtotal: item.price,
      total: item.price,
      placedWhileClosed: true,
      alertAt,
      notifiedAt: new Date(),
      items: {
        create: [{ menuItemId: item.id, name: item.name, quantity: 1, price: item.price, subtotal: item.price }],
      },
    },
    select: { id: true, orderNumber: true },
  });

  const existingResv = await prisma.reservation.findFirst({
    where: { restaurantId: r.id, customerEmail: "resv-cancel-e2e@example.com", status: "pending" },
    select: { id: true, confirmationCode: true },
  });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const dateStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const resv = existingResv ?? await prisma.reservation.create({
    data: {
      restaurantId: r.id,
      confirmationCode: `R${Date.now().toString().slice(-6)}`,
      customerName: "[TEST] Resv Cancel E2E",
      customerEmail: "resv-cancel-e2e@example.com",
      customerPhone: "+15550100201",
      partySize: 3,
      date: dateStr,
      time: "19:30",
      status: "pending",
    },
    select: { id: true, confirmationCode: true },
  });

  const base = "http://localhost:3001";
  const orderTok = signActionToken("order-cancel", order.id);
  const resvTok = signActionToken("reservation-cancel", resv.id);
  const statusTok = signActionToken("order-status", order.id); // wrong purpose

  console.log(`order       ${order.id}  #${order.orderNumber}`);
  console.log(`reservation ${resv.id}  #${resv.confirmationCode}`);
  console.log("");
  console.log("ORDER cancel (valid):");
  console.log(`  ${base}/order/${r.slug}/status/${order.id}?cancel=${orderTok}`);
  console.log("ORDER cancel (WRONG-PURPOSE status token — must be denied):");
  console.log(`  ${base}/order/${r.slug}/status/${order.id}?cancel=${statusTok}`);
  console.log("RESERVATION cancel (valid):");
  console.log(`  ${base}/order/${r.slug}/reservation/${resv.id}/cancel?t=${resvTok}`);
  console.log("RESERVATION cancel (TAMPERED — must show invalid link):");
  console.log(`  ${base}/order/${r.slug}/reservation/${resv.id}/cancel?t=${resvTok.slice(0, -4)}AAAA`);
}

main().finally(() => prisma.$disconnect());
