/** Read-only: reconcile order ORD-761962580's emails against Luigi's settings. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" }); config({ path: ".env" });
async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const o = await p.order.findFirst({
    where: { orderNumber: "ORD-761962580" },
    select: {
      customerLocale: true, status: true, type: true, paymentMethod: true, paymentStatus: true,
      creditApplied: true, total: true, notifiedAt: true, acceptedAt: true, createdAt: true,
      restaurant: {
        select: {
          name: true, defaultLanguage: true, autoAcceptOrders: true,
          customerEmailOrderConfirm: true,
          notificationRecipients: {
            select: { email: true, isActive: true, emailLanguage: true, orderPlaced: true, orderAccepted: true, pickupConfirmed: true },
          },
        },
      },
    },
  });
  console.log(JSON.stringify(o, null, 1));
}
main();
