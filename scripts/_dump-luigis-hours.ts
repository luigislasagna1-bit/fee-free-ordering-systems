/** READ-ONLY: dump Luigi's restaurant + its OpeningHours rows (general vs per-service)
 *  to diagnose the storefront "Opens at 4 PM" while general hours are open.
 *    npx tsx scripts/run-on-prod.ts scripts/_dump-luigis-hours.ts
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

  const r = await prisma.restaurant.findFirst({
    where: { OR: [{ slug: "luigis" }, { subdomain: "luigis" }] },
    select: { id: true, name: true, slug: true, subdomain: true, timezone: true },
  });
  if (!r) { console.log("No restaurant matching slug/subdomain 'luigis'"); await prisma.$disconnect(); return; }
  console.log("RESTAURANT:", JSON.stringify(r));

  const hours = await prisma.openingHours.findMany({
    where: { restaurantId: r.id },
    orderBy: [{ service: "asc" }, { dayOfWeek: "asc" }],
  });
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  console.log(`\nOPENING HOURS (${hours.length} rows):`);
  for (const h of hours) {
    console.log(`  ${dows[h.dayOfWeek] ?? h.dayOfWeek}  service=${h.service ?? "GENERAL(null)"}  isOpen=${h.isOpen}  ${h.openTime}-${h.closeTime}  nextDay=${h.closesNextDay}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
