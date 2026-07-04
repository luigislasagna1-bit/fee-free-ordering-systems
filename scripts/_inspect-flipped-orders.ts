/** Read-only: full timeline fields for the 3 flipped orders (cmr6meaaq).
 *   npx tsx scripts/run-on-prod.ts scripts/_inspect-flipped-orders.ts */
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

  const orders = await prisma.order.findMany({
    where: { orderNumber: { in: ["ORD-724296909", "ORD-116497279", "ORD-366702546"] } },
    select: {
      orderNumber: true, status: true, createdAt: true, notifiedAt: true, alertAt: true,
      placedWhileClosed: true, acceptedAt: true, rejectedAt: true, rejectionReason: true,
      completedAt: true, scheduledFor: true, estimatedReady: true, updatedAt: true,
      paymentMethod: true, paymentStatus: true, alertCallAt: true,
    },
  });
  for (const o of orders) console.log(JSON.stringify(o, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
