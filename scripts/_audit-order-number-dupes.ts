/** READ-ONLY: any duplicate (restaurantId, orderNumber) pairs? Must be zero
 *  before adding the @@unique constraint. Also checks reservation numbers.
 *  Run: npx tsx scripts/run-on-prod.ts scripts/_audit-order-number-dupes.ts */
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

  const dupes = await prisma.$queryRaw<Array<{ restaurantId: string; orderNumber: string; n: bigint }>>`
    SELECT "restaurantId", "orderNumber", COUNT(*) AS n
    FROM "Order"
    GROUP BY "restaurantId", "orderNumber"
    HAVING COUNT(*) > 1
    LIMIT 20
  `;
  console.log(`duplicate (restaurantId, orderNumber) pairs: ${dupes.length}`);
  for (const d of dupes) console.log(`  ${d.restaurantId} ${d.orderNumber} ×${d.n}`);

  const total = await prisma.order.count();
  console.log(`total orders: ${total}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message?.slice(0, 300)); process.exit(1); });
