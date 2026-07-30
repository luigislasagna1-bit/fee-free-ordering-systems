/** Read-only: Luigi's store — customers with reward balances + signup dates,
 *  so we can state exactly what the new columns should show on prod. */
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
  const p = new PrismaClient({ adapter } as any);
  const rs = await p.restaurant.findMany({
    where: { name: { contains: "Lasagna", mode: "insensitive" } },
    select: { id: true, slug: true, name: true, rewardsEnabled: true, rewardLabelPlural: true, _count: { select: { customers: true, orders: true } } },
  });
  for (const r of rs) {
    console.log(`\nstore ${r.slug} "${r.name}" rewardsEnabled=${r.rewardsEnabled} label="${r.rewardLabelPlural}" customers=${r._count.customers} orders=${r._count.orders}`);
    const wallets = await p.rewardAccount.findMany({
      where: { restaurantId: r.id, balance: { gt: 0 } },
      select: { balance: true, customer: { select: { name: true, email: true, signedUpAt: true } } },
      orderBy: { balance: "desc" },
      take: 10,
    });
    for (const w of wallets) {
      console.log(`  $${w.balance.toFixed(2)} — ${w.customer.name} <${w.customer.email}> signedUp=${w.customer.signedUpAt?.toISOString().slice(0, 10) ?? "guest"}`);
    }
    console.log(`  (${wallets.length} wallets with balance > 0, showing up to 10)`);
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
