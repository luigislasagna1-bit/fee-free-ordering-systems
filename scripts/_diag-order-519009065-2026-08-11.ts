/** READ-ONLY: auto-accept + dispatch timeline for the 2:55 PM delivery test. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`now=${new Date().toISOString()}`);
  const o = await prisma.order.findFirst({
    where: { orderNumber: "ORD-519009065" },
    select: {
      id: true, orderNumber: true, status: true, type: true,
      createdAt: true, acceptedAt: true, notifiedAt: true,
      paymentMethod: true, paymentStatus: true,
      preparationTime: true, estimatedReady: true, scheduledFor: true,
      placedWhileClosed: true, alertAt: true,
      shipdayOrderId: true, shipdayStatus: true, dispatchedAt: true,
      customerEmail: true, deliveryAddress: true, total: true,
    },
  });
  console.log("ORDER " + JSON.stringify(o, (_k, v) => (v instanceof Date ? v.toISOString() : v), 1));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
