/** READ-ONLY: accept/dispatch timeline for the two orders in question + now(). */
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
  const r = await prisma.restaurant.findFirst({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: { autoAcceptOrders: true },
  });
  console.log(`autoAcceptOrders=${r?.autoAcceptOrders}`);
  const orders = await prisma.order.findMany({
    where: { orderNumber: { in: ["ORD-349997643", "ORD-672776216"] } },
    select: {
      orderNumber: true, createdAt: true, acceptedAt: true, notifiedAt: true,
      status: true, paymentStatus: true, scheduledFor: true,
      shipdayOrderId: true, shipdayStatus: true, dispatchedAt: true,
    },
  });
  for (const o of orders) {
    console.log(JSON.stringify({
      ...o,
      createdAt: o.createdAt?.toISOString(),
      acceptedAt: o.acceptedAt?.toISOString(),
      notifiedAt: o.notifiedAt?.toISOString(),
      scheduledFor: o.scheduledFor?.toISOString() ?? null,
      dispatchedAt: o.dispatchedAt?.toISOString() ?? null,
    }));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
