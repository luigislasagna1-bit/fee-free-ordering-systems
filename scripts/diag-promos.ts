/** READ-ONLY: dump active promos for a restaurant with full config so we can
 *  diagnose a discount bug.
 *   npx tsx scripts/run-on-prod.ts scripts/diag-promos.ts luigis-lasagna-pizzeria */
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

  const slug = process.argv[2] ?? "luigis-lasagna-pizzeria";
  const r = await prisma.restaurant.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!r) { console.log("no restaurant", slug); await prisma.$disconnect(); return; }
  console.log(`Restaurant: ${r.name} (${r.id})\n`);

  const promos = await prisma.promotion.findMany({
    where: { restaurantId: r.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`${promos.length} active promo(s):\n`);
  for (const p of promos) {
    console.log(`── "${p.name}"  [${p.promotionType}]  coupon=${p.couponCode ?? "—"} stacking=${p.stackingRule} order=${p.orderType} autoApply=${p.autoApply}`);
    console.log(`   minOrder=${p.minimumOrder} usable=${p.usableHourStart}-${p.usableHourEnd} days=${p.daysOfWeek ?? "all"}`);
    console.log(`   rules=${p.rules}`);
    console.log("");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
