/** READ-ONLY: how many reward accounts belong to GUEST customers (no password)
 *  and carry a positive balance — i.e. silently-accrued wallets that a future
 *  signup would hand over. Per restaurant, with totals.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_audit-guest-reward-balances.ts */
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

  const accounts = await prisma.rewardAccount.findMany({
    where: { balance: { gt: 0 } },
    select: {
      id: true, balance: true, lifetimeEarned: true, restaurantId: true, customerId: true,
    },
    take: 500,
  });
  console.log(`reward accounts with balance > 0: ${accounts.length}`);

  const customerIds = [...new Set(accounts.map((a) => a.customerId))];
  const customers = await prisma.customer.findMany({
    where: { id: { in: customerIds } },
    select: { id: true, name: true, email: true, passwordHash: true, restaurantId: true },
  });
  const byId = new Map(customers.map((c) => [c.id, c]));
  const restaurants = await prisma.restaurant.findMany({
    where: { id: { in: [...new Set(accounts.map((a) => a.restaurantId))] } },
    select: { id: true, name: true },
  });
  const rById = new Map(restaurants.map((r) => [r.id, r.name]));

  let guestTotal = 0, acctTotal = 0;
  for (const a of accounts) {
    const c = byId.get(a.customerId);
    const isGuest = !c?.passwordHash;
    if (isGuest) guestTotal += a.balance; else acctTotal += a.balance;
    console.log(`  ${isGuest ? "GUEST  " : "ACCOUNT"}  $${a.balance.toFixed(2)} (lifetime $${a.lifetimeEarned.toFixed(2)})  ${c?.name ?? "?"} <${c?.email ?? "-"}>  @ ${rById.get(a.restaurantId) ?? a.restaurantId}`);
  }
  console.log(`\nTOTALS: guest-held $${guestTotal.toFixed(2)} | account-held $${acctTotal.toFixed(2)}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
