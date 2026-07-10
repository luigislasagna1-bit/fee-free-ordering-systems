/** READ-ONLY: reward ledger audit for one customer email at Luigi's restaurant —
 *  who granted what, when, with which reason/orderId. Plus the restaurant's
 *  signup-bonus config + active earn rules, so we can explain every line.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_audit-reward-ledger-customer.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const EMAIL = "support@feefreeordering.com";
const SLUG = "luigis-lasagna-pizzeria";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: SLUG },
    select: {
      id: true, name: true, rewardsEnabled: true, rewardSignupBonus: true,
      rewardEarnEnabled: true, rewardEarnMode: true, rewardEarnPercent: true, rewardEarnPerDollar: true,
    },
  });
  if (!restaurant) { console.log("restaurant not found"); return; }
  console.log(`RESTAURANT ${restaurant.name}: rewardsEnabled=${restaurant.rewardsEnabled} signupBonus=$${restaurant.rewardSignupBonus} earnEnabled=${restaurant.rewardEarnEnabled} mode=${restaurant.rewardEarnMode} pct=${restaurant.rewardEarnPercent} perDollar=${restaurant.rewardEarnPerDollar}`);

  const rules = await prisma.rewardEarnRule.findMany({
    where: { restaurantId: restaurant.id },
    select: { id: true, active: true, triggerType: true, earnAmount: true, earnPercent: true, orderThreshold: true, nthInterval: true, startsAt: true, endsAt: true, label: true } as any,
  }).catch(async () =>
    prisma.rewardEarnRule.findMany({
      where: { restaurantId: restaurant.id },
      select: { id: true, active: true, triggerType: true, earnAmount: true, earnPercent: true, orderThreshold: true, nthInterval: true, startsAt: true, endsAt: true },
    }));
  console.log(`\nEARN RULES (${rules.length}):`);
  for (const r of rules as any[]) {
    console.log(`  - ${r.id.slice(-6)} ${r.triggerType} active=${r.active} amount=${r.earnAmount} pct=${r.earnPercent} threshold=${r.orderThreshold} nth=${r.nthInterval} window=${r.startsAt?.toISOString?.() ?? "-"}..${r.endsAt?.toISOString?.() ?? "-"}${r.label ? ` label="${r.label}"` : ""}`);
  }

  const customers = await prisma.customer.findMany({
    where: { restaurantId: restaurant.id, email: EMAIL },
    select: { id: true, name: true, phone: true, passwordHash: true, createdAt: true, lastLoginAt: true, customerAccountId: true },
  });
  console.log(`\nCUSTOMER ROWS for ${EMAIL}: ${customers.length}`);
  for (const c of customers) {
    console.log(`  - ${c.id}  name="${c.name}"  phone=${c.phone ?? "none"}  hasPassword=${!!c.passwordHash}  createdAt=${c.createdAt.toISOString()}  lastLogin=${c.lastLoginAt?.toISOString() ?? "-"}  mktAcct=${c.customerAccountId ?? "-"}`);
  }

  for (const c of customers) {
    const acct = await prisma.rewardAccount.findFirst({
      where: { restaurantId: restaurant.id, customerId: c.id },
      select: { id: true, balance: true, lifetimeEarned: true, createdAt: true },
    });
    if (!acct) { console.log(`\nNO reward account for customer ${c.id}`); continue; }
    console.log(`\nREWARD ACCOUNT ${acct.id} (customer ${c.id}): balance=$${acct.balance} lifetime=$${acct.lifetimeEarned} createdAt=${acct.createdAt.toISOString()}`);
    const rows = await prisma.rewardLedger.findMany({
      where: { accountId: acct.id },
      orderBy: { createdAt: "asc" },
      take: 50,
      select: { amount: true, balanceAfter: true, reason: true, note: true, orderId: true, createdAt: true },
    });
    for (const l of rows) {
      console.log(`  ${l.createdAt.toISOString()}  ${l.amount >= 0 ? "+" : ""}$${l.amount}  reason=${l.reason}  note=${l.note ?? "-"}  orderId=${l.orderId ?? "-"}  bal=$${l.balanceAfter}`);
    }
    // Resolve any real order ids referenced so we can see when those orders happened.
    const orderIds = [...new Set(rows.map((l) => l.orderId).filter((x): x is string => !!x && !x.startsWith("signup:")))];
    if (orderIds.length) {
      const orders = await prisma.order.findMany({
        where: { id: { in: orderIds } },
        select: { id: true, orderNumber: true, status: true, createdAt: true, completedAt: true, subtotal: true, total: true, customerId: true },
      });
      console.log(`  referenced orders:`);
      for (const o of orders) {
        console.log(`    ${o.id}  #${o.orderNumber}  ${o.status}  created=${o.createdAt.toISOString()}  completed=${o.completedAt?.toISOString() ?? "-"}  subtotal=$${o.subtotal}  total=$${o.total}  customerId=${o.customerId}`);
      }
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
