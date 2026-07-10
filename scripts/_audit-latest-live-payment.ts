/** READ-ONLY: the most recent card-paid orders at Luigi's restaurant — payment
 *  state, amounts, capture status. Proof for the live-payment UAT. No secrets.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_audit-latest-live-payment.ts */
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

  const r = await prisma.restaurant.findUnique({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true } });
  if (!r) { console.log("restaurant not found"); return; }

  const orders = await prisma.order.findMany({
    where: { restaurantId: r.id, paymentMethod: { in: ["card", "online_card"] } },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      orderNumber: true, status: true, createdAt: true, total: true, subtotal: true, taxAmount: true,
      paymentMethod: true, paymentStatus: true, paymentIntentId: true, refundedAmount: true,
      customer: { select: { email: true, name: true } },
    },
  });
  for (const o of orders) {
    console.log(`#${o.orderNumber}  ${o.status}  ${o.createdAt.toISOString()}  subtotal=$${o.subtotal} tax=$${o.taxAmount} total=$${o.total}`);
    console.log(`   pay=${o.paymentMethod}  paymentStatus=${o.paymentStatus}  refunded=$${(o as any).refundedAmount ?? 0}  intent=${o.paymentIntentId ? o.paymentIntentId.slice(0, 8) + "…" + o.paymentIntentId.slice(-4) : "NONE"}  by=${o.customer?.name ?? "?"} <${o.customer?.email ?? "-"}>`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message?.slice(0, 400)); process.exit(1); });
