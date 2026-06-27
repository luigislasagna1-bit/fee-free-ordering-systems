/** DEV DB ONLY: create a "pickup closed 16:00–20:00 today" special day on the seeded
 *  demo restaurant so we can eyeball the closed-window banner on /order. Additive — prints
 *  the row id; clean up with _dev-del-test-holiday.ts.
 *  Run: npx tsx scripts/_dev-set-pickup-closed-window.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { dateKeyInTimezone } from "../src/lib/restaurant-hours";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  let r = await prisma.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true, slug: true, name: true, timezone: true } });
  if (!r) {
    const all = await prisma.restaurant.findMany({ select: { slug: true }, take: 30, orderBy: { createdAt: "asc" } });
    console.log("demo-pizza-palace not found. Available slugs:\n  " + all.map((x) => x.slug).join("\n  "));
    await prisma.$disconnect(); return;
  }
  const tz = r.timezone || "America/Toronto";
  const todayKey = dateKeyInTimezone(new Date(), tz);
  await prisma.restaurantHoliday.create({
    data: {
      restaurantId: r.id,
      date: new Date(`${todayKey}T00:00:00.000Z`),
      name: "ZZTEST pickup closed window",
      rules: JSON.stringify([{ services: ["pickup"], mode: "closed_windows", intervals: [{ open: "16:00", close: "20:00" }] }]),
    },
  });
  console.log(`✓ ${r.name} (${r.slug}, tz=${tz}) — test "pickup closed 16:00–20:00" added for ${todayKey}`);
  console.log(`  Preview /order/${r.slug} → expect amber "Pickup closed 16:00 – 20:00 today"`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
