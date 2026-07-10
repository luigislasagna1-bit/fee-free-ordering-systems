/** Backfill Customer.signedUpAt for existing ACCOUNT holders (passwordHash set,
 *  signedUpAt still null) so they keep earning reward credit under the new
 *  "order must be placed after signup" gate. We don't know their true signup
 *  moment, so createdAt (earliest defensible date) grandfathers all their
 *  in-flight orders — matching pre-gate behaviour for existing members.
 *  Guests (passwordHash null) stay null on purpose: they must not earn.
 *  Idempotent. Run on BOTH branches:
 *    npx tsx scripts/backfill-signed-up-at.ts               (dev / active URL)
 *    npx tsx scripts/run-on-prod.ts scripts/backfill-signed-up-at.ts
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

  const result = await prisma.$executeRaw`
    UPDATE "Customer"
    SET "signedUpAt" = "createdAt"
    WHERE "passwordHash" IS NOT NULL AND "signedUpAt" IS NULL
  `;
  console.log(`backfilled signedUpAt on ${result} account-holder Customer row(s)`);

  const remaining = await prisma.customer.count({ where: { passwordHash: { not: null }, signedUpAt: null } });
  console.log(`account holders still missing signedUpAt: ${remaining} (must be 0)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
