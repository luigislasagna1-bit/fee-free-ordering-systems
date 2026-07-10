/** One-time DDL (hardening 2026-07-10): the exact reviewed SQL from
 *  `prisma migrate diff` for the orderNumber unique + webhook-lookup indexes.
 *  Applied manually because `db push` flags a fresh unique constraint as
 *  potentially destructive (both branches audited duplicate-free first via
 *  scripts/_audit-order-number-dupes.ts). Idempotent (IF EXISTS / IF NOT
 *  EXISTS). Run on BOTH branches:
 *    npx tsx scripts/_apply-order-number-unique.ts
 *    npx tsx scripts/run-on-prod.ts scripts/_apply-order-number-unique.ts
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

  // Safety: re-verify zero duplicates on THIS database before the constraint.
  const dupes = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*) AS n FROM (
      SELECT 1 FROM "Order" GROUP BY "restaurantId", "orderNumber" HAVING COUNT(*) > 1
    ) d
  `;
  if (Number(dupes[0]?.n ?? 0) > 0) {
    console.error("ABORT: duplicate (restaurantId, orderNumber) pairs exist — resolve first.");
    process.exit(1);
  }

  await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Order_restaurantId_orderNumber_idx"`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_shipdayOrderId_idx" ON "Order"("shipdayOrderId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_paypalCaptureId_idx" ON "Order"("paypalCaptureId")`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Order_restaurantId_orderNumber_key" ON "Order"("restaurantId", "orderNumber")`);
  console.log("applied: dropped old index, created shipdayOrderId + paypalCaptureId indexes, created unique (restaurantId, orderNumber)");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e?.message?.slice(0, 400)); process.exit(1); });
