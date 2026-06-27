/** READ-ONLY: find Luigi's restaurant(s) + their current hours + parent/child structure,
 *  so we can pick the right target to set the Fabrizio-scenario test hours on.
 *    npx tsx scripts/run-on-prod.ts scripts/_dump-luigi-restaurants.ts
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
    where: {
      OR: [
        { name: { contains: "Luigi", mode: "insensitive" } },
        { slug: { contains: "luigis", mode: "insensitive" } },
        { subdomain: { contains: "luigis", mode: "insensitive" } },
        { email: { contains: "luigislasagna", mode: "insensitive" } },
      ],
    },
    select: {
      id: true, name: true, slug: true, subdomain: true, timezone: true, hoursFormat: true,
      email: true, parentRestaurantId: true, inheritedSettings: true,
    },
    orderBy: { name: "asc" },
    take: 30,
  });
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  console.log(`Found ${rs.length} restaurant(s) matching Luigi:`);
  for (const r of rs) {
    console.log(`\n=== ${r.name}`);
    console.log(`    id=${r.id} slug=${r.slug} sub=${r.subdomain} tz=${r.timezone ?? "—"} fmt=${r.hoursFormat} email=${r.email ?? "—"}`);
    console.log(`    parentRestaurantId=${r.parentRestaurantId ?? "(none — standalone/parent)"}  inheritedSettings=${JSON.stringify(r.inheritedSettings ?? null)}`);
    const hours = await prisma.openingHours.findMany({
      where: { restaurantId: r.id },
      orderBy: [{ service: "asc" }, { dayOfWeek: "asc" }],
    });
    const general = hours.filter((h) => h.service == null || h.service === "");
    const svc = [...new Set(hours.filter((h) => h.service).map((h) => h.service))];
    console.log(`    hours: ${hours.length} rows | general(null)=${general.length} | services=[${svc.join(", ")}]`);
    for (const h of general) {
      console.log(`        GENERAL ${dows[h.dayOfWeek]} isOpen=${h.isOpen} ${h.openTime}-${h.closeTime} iv=${(h as any).intervals != null ? JSON.stringify((h as any).intervals) : "—"}`);
    }
  }
  // current server time for reference
  console.log(`\nServer now (UTC): ${new Date().toISOString()}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
