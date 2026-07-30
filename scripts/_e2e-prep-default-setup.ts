/** Dev fixtures for the accept-popup smart default: one pending DELIVERY with
 *  a 60-min zone estimate + one pending PICKUP. Prints restaurant defaults. */
import prisma from "../src/lib/db";
async function main() {
  const r = await prisma.restaurant.findUnique({
    where: { slug: "demo-pizza-palace" },
    select: { id: true, estimatedPickup: true, estimatedDelivery: true },
  });
  if (!r) throw new Error("no demo restaurant");
  console.log("defaults:", { pickup: r.estimatedPickup, delivery: r.estimatedDelivery });
  const item = await prisma.menuItem.findFirst({ where: { restaurantId: r.id }, select: { id: true, name: true, price: true } });
  if (!item) throw new Error("no item");
  for (const [type, zone, name] of [["delivery", 60, "[TEST] Prep Delivery 60"], ["pickup", null, "[TEST] Prep Pickup"]] as const) {
    await prisma.order.create({
      data: {
        restaurantId: r.id, orderNumber: `PREP${type === "delivery" ? "D" : "P"}${Date.now().toString().slice(-5)}`,
        customerName: name, customerEmail: null, customerPhone: "+15550105000",
        type, status: "pending", paymentMethod: "cash", paymentStatus: "pending",
        subtotal: item.price, total: item.price, notifiedAt: new Date(),
        // Parked (alertAt future) so the accept countdown never auto-rejects
        // the fixture while we inspect the popup.
        alertAt: new Date(Date.now() + 2 * 60 * 60 * 1000), placedWhileClosed: true,
        ...(type === "delivery" ? { deliveryAddress: "1 Test St", deliveryEstimatedMinutes: zone } : {}),
        items: { create: [{ menuItemId: item.id, name: item.name, quantity: 1, price: item.price, subtotal: item.price }] },
      },
    });
    console.log("created", name);
  }
}
main().finally(() => prisma.$disconnect());
