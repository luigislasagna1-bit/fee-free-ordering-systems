/** READ-ONLY: what side effects did auto-complete fire on the 3 ghost orders? */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const GHOSTS = ["ORD-710341102", "ORD-733393825", "ORD-721054168"];
const J = (o: unknown) => JSON.stringify(o, (_k, v) => (v instanceof Date ? v.toISOString() : v));

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  for (const num of GHOSTS) {
    const o = await prisma.order.findFirst({
      where: { orderNumber: num },
      select: {
        id: true, orderNumber: true, customerId: true, total: true, creditApplied: true,
        couponId: true, appliedPromos: true, status: true, paymentStatus: true,
        viaMarketplace: true, marketplaceCounterApplied: true, smartLinkCounterApplied: true,
        customerEmail: true, customerName: true, restaurantId: true,
      },
    });
    if (!o) { console.log(`${num}: NOT FOUND`); continue; }
    console.log(`\n=== ${num} (${o.id}) ${o.status}/${o.paymentStatus} $${o.total} ===`);
    console.log(`  promos=${o.appliedPromos ?? "none"} coupon=${o.couponId ?? "none"} credit=${o.creditApplied}`);

    const ledger = await prisma.rewardLedger.findMany({
      where: { orderId: o.id },
      select: { id: true, type: true, amount: true, createdAt: true, note: true } as any,
    }).catch((e: unknown) => { console.log("  ledger err " + String(e).slice(0, 120)); return []; });
    for (const l of ledger as any[]) console.log("  REWARD_LEDGER " + J(l));
    if ((ledger as any[]).length === 0) console.log("  REWARD_LEDGER none");

    const usage = await prisma.promotionUsage.findMany({
      where: { orderId: o.id },
      select: { id: true, promotionId: true, createdAt: true } as any,
    }).catch(() => []);
    for (const u of usage as any[]) console.log("  PROMO_USAGE " + J(u));
    if ((usage as any[]).length === 0) console.log("  PROMO_USAGE none");

    if (o.customerId) {
      const c = await prisma.customer.findUnique({
        where: { id: o.customerId },
        select: { id: true, email: true, totalOrders: true, totalSpent: true } as any,
      });
      console.log("  CUSTOMER " + J(c));
      const acct = await prisma.rewardAccount.findFirst({
        where: { customerId: o.customerId },
        select: { id: true, balance: true } as any,
      }).catch(() => null);
      console.log("  REWARD_ACCOUNT " + J(acct));
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
