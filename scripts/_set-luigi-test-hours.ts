/** Set Luigi's restaurant to the Fabrizio test scenario (general OPEN now, pickup +
 *  delivery open LATER today) so we can live-test ring/header/checkout. BACKS UP the
 *  current hours to scripts/_luigi-hours-backup.json first (restore with _restore-luigi-hours.ts).
 *    npx tsx scripts/run-on-prod.ts scripts/_set-luigi-test-hours.ts
 */
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = "luigis-lasagna-pizzeria";
const EXPECT_EMAIL = "info@luigislasagna.com";

// Decisive scenario (general open NOW at ~14:15 Toronto, services later today):
const TEST = {
  general:  { openTime: "09:00", closeTime: "23:00" },
  pickup:   { openTime: "18:00", closeTime: "23:00" },
  delivery: { openTime: "19:00", closeTime: "23:00" },
};

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({
    where: { slug: SLUG },
    select: { id: true, name: true, slug: true, email: true, timezone: true, hoursFormat: true, parentRestaurantId: true },
  });
  if (!r) { console.log(`!! No restaurant slug=${SLUG}`); await prisma.$disconnect(); return; }
  if (r.email !== EXPECT_EMAIL) {
    console.log(`!! SAFETY STOP: ${r.slug} email=${r.email} != ${EXPECT_EMAIL}. Aborting.`);
    await prisma.$disconnect(); return;
  }
  console.log(`Target: ${r.name} (slug=${r.slug}, tz=${r.timezone}, fmt=${r.hoursFormat}, email=${r.email})`);

  // 1) BACKUP current hours.
  const current = await prisma.openingHours.findMany({ where: { restaurantId: r.id }, orderBy: [{ service: "asc" }, { dayOfWeek: "asc" }] });
  writeFileSync("scripts/_luigi-hours-backup.json", JSON.stringify({ restaurantId: r.id, slug: r.slug, savedAtUtc: new Date().toISOString(), rows: current }, null, 2));
  console.log(`Backed up ${current.length} rows → scripts/_luigi-hours-backup.json`);

  // 2) Upsert the test config for all 7 days × {general(null), pickup, delivery}.
  const plan: Array<{ service: string | null; openTime: string; closeTime: string }> = [
    { service: null,       ...TEST.general },
    { service: "pickup",   ...TEST.pickup },
    { service: "delivery", ...TEST.delivery },
  ];
  for (const p of plan) {
    for (let d = 0; d < 7; d++) {
      const data = {
        isOpen: true, openTime: p.openTime, closeTime: p.closeTime, closesNextDay: false,
        intervals: [{ open: p.openTime, close: p.closeTime, closesNextDay: false }],
      };
      const existing = await prisma.openingHours.findFirst({ where: { restaurantId: r.id, dayOfWeek: d, service: p.service }, select: { id: true } });
      if (existing) await prisma.openingHours.update({ where: { id: existing.id }, data });
      else await prisma.openingHours.create({ data: { restaurantId: r.id, dayOfWeek: d, service: p.service, ...data } });
    }
  }
  console.log("Set: GENERAL 09:00-23:00 · PICKUP 16:00-23:00 · DELIVERY 17:00-23:00 (all 7 days, no gaps, no overnight).");

  const tz = r.timezone ?? "America/Toronto";
  const local = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date());
  console.log(`\nNOW in ${tz}: ${local}`);
  console.log("Scenario: GENERAL is OPEN now; PICKUP opens 4:00 PM; DELIVERY opens 5:00 PM (so both services are CLOSED right now).");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
