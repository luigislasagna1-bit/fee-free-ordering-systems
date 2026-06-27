/** Find Luigi's restaurant(s) on prod + timezone + current local time + today's hours,
 *  to set up the "opening hours per service" live test.
 *    npx tsx scripts/run-on-prod.ts scripts/_find-luigi-restaurant.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const DOW: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

function localNow(tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, weekday: "long", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const weekday = get("weekday");
  return { weekday, dow: DOW[weekday], hhmm: `${get("hour")}:${get("minute")}` };
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const restaurants = await prisma.restaurant.findMany({
    where: { OR: [
      { name: { contains: "lasagna", mode: "insensitive" } },
      { slug: { contains: "lasagna" } },
      { name: { contains: "luigi", mode: "insensitive" } },
    ] },
    select: { id: true, name: true, slug: true, timezone: true, parentRestaurantId: true,
      openingHours: { select: { dayOfWeek: true, service: true, isOpen: true, openTime: true, closeTime: true, intervals: true } } },
  });
  console.log(`Found ${restaurants.length} restaurant(s):\n`);
  for (const r of restaurants as any[]) {
    const tz = r.timezone || "UTC";
    const now = localNow(tz);
    console.log(`● ${r.name}  (slug=${r.slug})`);
    console.log(`   id=${r.id}  tz=${tz}  parent=${r.parentRestaurantId ?? "none"}`);
    console.log(`   LOCAL NOW: ${now.weekday} ${now.hhmm}  (dow=${now.dow})`);
    const todays = r.openingHours.filter((h: any) => h.dayOfWeek === now.dow);
    if (!todays.length) console.log(`   today's hours: (no rows for dow=${now.dow})`);
    for (const h of todays) {
      const iv = h.intervals ? JSON.stringify(h.intervals) : "—";
      console.log(`   today  service=${h.service ?? "GENERAL"}  isOpen=${h.isOpen}  ${h.openTime}–${h.closeTime}  intervals=${iv}`);
    }
    console.log("");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
