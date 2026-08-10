/**
 * READ-ONLY: was the $1.70 delta on ORD-233787293 a promo discount?
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-twin-order-promo-2026-08-10.ts
 */
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

  for (const num of ["ORD-233787293", "ORD-235548666"]) {
    const o: any = await prisma.order.findFirst({ where: { orderNumber: num } });
    if (!o) { console.log(`${num}: not found`); continue; }
    const interesting: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v === null || v === undefined || v === 0 || v === "" || v === false) continue;
      if (/discount|promo|coupon|credit|reward|total|subtotal|tax|fee|customerId|isNew/i.test(k)) interesting[k] = v;
    }
    console.log(num, JSON.stringify(interesting, null, 1));
  }

  const customers = await prisma.customer.findMany({
    where: { email: { contains: "6476690808" } },
    select: { id: true, email: true, createdAt: true, totalOrders: true, totalSpent: true },
  });
  console.log("voice-sentinel customers:", JSON.stringify(customers));
}

main().catch((e) => { console.error(e); process.exit(1); });
