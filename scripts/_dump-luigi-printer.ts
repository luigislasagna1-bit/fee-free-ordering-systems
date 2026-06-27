/** READ-ONLY: dump Luigi's printer copies settings to diagnose the 3-customer/1-kitchen issue.
 *    npx tsx scripts/run-on-prod.ts scripts/_dump-luigi-printer.ts
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
  const r = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true } });
  if (!r) { console.log("not found"); await prisma.$disconnect(); return; }
  const ps = await prisma.printerSettings.findMany({ where: { restaurantId: r.id } });
  console.log(`${r.name} — ${ps.length} printerSettings row(s):`);
  for (const p of ps) console.log(JSON.stringify(p, null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
