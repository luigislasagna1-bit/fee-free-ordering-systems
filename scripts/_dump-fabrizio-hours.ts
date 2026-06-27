/** READ-ONLY: dump Fabrizio's "Japanese Restaurant | TEST" + its OpeningHours rows
 *  (general vs per-service) to confirm whether the GENERAL (service=null) row exists.
 *    npx tsx scripts/run-on-prod.ts scripts/_dump-fabrizio-hours.ts
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

  const rs = await prisma.restaurant.findMany({
    where: { name: { contains: "Japanese", mode: "insensitive" } },
    select: { id: true, name: true, slug: true, subdomain: true, timezone: true, hoursFormat: true },
    take: 10,
  });
  console.log(`Found ${rs.length} restaurant(s) whose name contains "Japanese":`);
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  for (const r of rs) {
    console.log(`\n=== ${r.name}  (slug=${r.slug}, sub=${r.subdomain}, tz=${r.timezone ?? "—"}, fmt=${r.hoursFormat}) id=${r.id}`);
    const hours = await prisma.openingHours.findMany({
      where: { restaurantId: r.id },
      orderBy: [{ service: "asc" }, { dayOfWeek: "asc" }],
    });
    console.log(`OPENING HOURS (${hours.length} rows):`);
    for (const h of hours) {
      const iv = (h as any).intervals != null ? JSON.stringify((h as any).intervals) : "—";
      console.log(`  ${dows[h.dayOfWeek] ?? h.dayOfWeek}  service=${(h.service ?? "GENERAL(null)").padEnd(13)} isOpen=${h.isOpen}  ${h.openTime}-${h.closeTime}  nextDay=${h.closesNextDay}  intervals=${iv}`);
    }
    const services = [...new Set(hours.map((h) => h.service ?? "GENERAL(null)"))];
    const generalRows = hours.filter((h) => h.service == null || h.service === "");
    console.log(`  services present: ${services.join(", ")}`);
    console.log(`  GENERAL(null) rows: ${generalRows.length}  ${generalRows.length === 0 ? "<-- ROOT CAUSE: no general row → falls back to a per-service row" : `(${generalRows.filter((h) => h.isOpen).length} open)`}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
