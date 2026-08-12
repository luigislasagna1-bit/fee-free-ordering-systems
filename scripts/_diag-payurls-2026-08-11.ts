/** READ-ONLY: the customer-facing domain + payment URLs for the unpaid orders. */
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

  const r = await prisma.restaurant.findUnique({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: { id: true, slug: true, subdomain: true, customDomain: true, customDomainStatus: true } as any,
  });
  console.log("RESTAURANT " + JSON.stringify(r));

  const orders = await prisma.order.findMany({
    where: { orderNumber: { in: ["ORD-710341102", "ORD-733393825", "ORD-721054168"] } },
    select: { id: true, orderNumber: true, total: true, customerName: true, customerEmail: true, status: true, paymentStatus: true, paymentIntentId: true },
  });
  for (const o of orders) console.log("ORDER " + JSON.stringify(o));

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
