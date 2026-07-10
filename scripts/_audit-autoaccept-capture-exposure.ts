/** READ-ONLY: which live restaurants have autoAcceptOrders ON while accepting
 *  online card, and are any recent card orders stuck at paymentStatus
 *  'authorized' (auth placed, never captured — the Critical from the payments
 *  audit)? No writes, no secrets.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_audit-autoaccept-capture-exposure.ts */
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

  // Restaurants with auto-accept on + a live card provider.
  const restos = await prisma.restaurant.findMany({
    where: { autoAcceptOrders: true },
    select: {
      id: true, name: true, slug: true, autoAcceptOrders: true, paymentMethods: true,
      paymentProvider: { select: { mode: true, isActive: true } },
    },
  });
  console.log(`restaurants with autoAcceptOrders=ON: ${restos.length}`);
  for (const r of restos) {
    console.log(`  - ${r.name} (${r.slug})  provider=${r.paymentProvider ? `${r.paymentProvider.mode}/active=${r.paymentProvider.isActive}` : "none"}  methods=${r.paymentMethods ?? "-"}`);
  }

  // The smoking gun: any card orders sitting at 'authorized' (released but never
  // captured). These are money the restaurant is owed but hasn't collected.
  const stuck = await prisma.order.findMany({
    where: { paymentMethod: "card", paymentStatus: "authorized" },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      orderNumber: true, status: true, createdAt: true, total: true,
      restaurant: { select: { name: true, autoAcceptOrders: true } },
    },
  });
  console.log(`\ncard orders stuck at paymentStatus='authorized' (never captured): ${stuck.length}`);
  for (const o of stuck) {
    const ageH = ((Date.now() - o.createdAt.getTime()) / 3600000).toFixed(1);
    console.log(`  #${o.orderNumber} status=${o.status} $${o.total} age=${ageH}h  @ ${o.restaurant.name} (autoAccept=${o.restaurant.autoAcceptOrders})`);
  }

  // Sanity: recent card orders overall + their payment statuses (distribution).
  const recent = await prisma.order.groupBy({
    by: ["paymentStatus"],
    where: { paymentMethod: "card" },
    _count: true,
  } as any).catch(() => null);
  if (recent) {
    console.log(`\nall-time card-order paymentStatus distribution:`);
    for (const g of recent as any[]) console.log(`  ${g.paymentStatus}: ${g._count}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message?.slice(0, 400)); process.exit(1); });
