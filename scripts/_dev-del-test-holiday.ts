/** DEV DB ONLY: remove the ZZTEST special-day rows created by _dev-set-pickup-closed-window.ts.
 *  Run: npx tsx scripts/_dev-del-test-holiday.ts
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
  const del = await prisma.restaurantHoliday.deleteMany({ where: { name: "ZZTEST pickup closed window" } });
  console.log(`✓ Removed ${del.count} ZZTEST special-day row(s).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
