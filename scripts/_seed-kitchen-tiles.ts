/* DEV-only: refresh demo orders so the kitchen display shows a delivery tile
 * (with address+city+zip on file — zip must NOT render), a pickup tile, and a
 * reservation, all "now". Also turns the delivery show-name option ON.
 * Names seeded lowercase to prove tile capitalization. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("no demo restaurant");
  await prisma.restaurant.update({ where: { id: r.id }, data: { kitchenDeliveryShowName: true } });

  const now = new Date();
  const delivery = await prisma.order.findFirst({ where: { restaurantId: r.id, type: "delivery" }, orderBy: { createdAt: "desc" } });
  if (!delivery) throw new Error("no delivery order to refresh");
  await prisma.order.update({
    where: { id: delivery.id },
    data: {
      customerName: "facsimile test",
      deliveryAddress: "via giuseppe mazzini 13",
      deliveryCity: "varedo",
      deliveryZip: "20814",
      status: "accepted",
      createdAt: now,
      notifiedAt: now,
      estimatedReady: new Date(now.getTime() + 45 * 60000),
      manuallyClearedAt: null,
      clearedFromKitchenAt: null,
      clearedFromAllAt: null,
      clearedFromCompleteAt: null,
    },
  });
  const pickup = await prisma.order.findFirst({ where: { restaurantId: r.id, type: "pickup", customerName: { not: { startsWith: "[TEST]" } } }, orderBy: { createdAt: "desc" } });
  if (pickup) {
    await prisma.order.update({
      where: { id: pickup.id },
      data: { customerName: "fabrizio pisu", status: "accepted", createdAt: now, notifiedAt: now, estimatedReady: new Date(now.getTime() + 20 * 60000), manuallyClearedAt: null, clearedFromKitchenAt: null, clearedFromAllAt: null, clearedFromCompleteAt: null },
    });
  }
  const res = await prisma.reservation.findFirst({ where: { restaurantId: r.id }, orderBy: { createdAt: "desc" } });
  if (res) {
    await prisma.reservation.update({
      where: { id: res.id },
      data: { customerName: "fabrizio test", status: "confirmed", createdAt: now, reservationTime: new Date(now.getTime() + 3 * 3600000) },
    }).catch((e: any) => console.log("reservation update skipped:", e.message?.slice(0, 120)));
  } else {
    console.log("no reservation row — comparing against reservation size from code (text-base) only");
  }
  console.log("✓ kitchen tiles seeded (delivery=facsimile test/varedo, pickup=fabrizio pisu)");
}
main().finally(() => prisma.$disconnect());
