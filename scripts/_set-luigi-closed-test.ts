/** Combined regression test (Luigi 2026-06-25): store CLOSED now but GENERAL opens in
 *  ~5 min; pickup opens ~1h after; delivery ~3h after. Place a pickup order now → it
 *  should DEFER (no ring); when general opens in ~5 min the deferred order should START
 *  RINGING (screen off) → accept → print. Proves "general hours dictate the ring".
 *  Does NOT touch the backup file (_luigi-hours-backup.json keeps the ORIGINAL hours).
 *    npx tsx scripts/run-on-prod.ts scripts/_set-luigi-closed-test.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = "luigis-lasagna-pizzeria";
const EXPECT_EMAIL = "info@luigislasagna.com";
const GENERAL_OFFSET_MIN = 10;    // store opens in 10 minutes
const PICKUP_OFFSET_MIN = 130;    // pickup ~2h after open
const DELIVERY_OFFSET_MIN = 190;  // delivery ~3h after open

function hhmm(totalMin: number): string {
  const m = ((totalMin % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({ where: { slug: SLUG }, select: { id: true, name: true, email: true, timezone: true } });
  if (!r || r.email !== EXPECT_EMAIL) { console.log(`!! SAFETY STOP: ${r?.slug} email=${r?.email}`); await prisma.$disconnect(); return; }

  const tz = r.timezone ?? "America/Toronto";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
  const curHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "12", 10) % 24;
  const curMin = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const nowMin = curHour * 60 + curMin;

  const times: Record<string, string> = {
    general: hhmm(nowMin + GENERAL_OFFSET_MIN),
    pickup: hhmm(nowMin + PICKUP_OFFSET_MIN),
    delivery: hhmm(nowMin + DELIVERY_OFFSET_MIN),
  };
  const plan: Array<{ service: string | null; key: string }> = [
    { service: null, key: "general" }, { service: "pickup", key: "pickup" }, { service: "delivery", key: "delivery" },
  ];
  for (const p of plan) {
    const openTime = times[p.key];
    for (let d = 0; d < 7; d++) {
      const data = { isOpen: true, openTime, closeTime: "23:00", closesNextDay: false, intervals: [{ open: openTime, close: "23:00", closesNextDay: false }] };
      const existing = await prisma.openingHours.findFirst({ where: { restaurantId: r.id, dayOfWeek: d, service: p.service }, select: { id: true } });
      if (existing) await prisma.openingHours.update({ where: { id: existing.id }, data });
      else await prisma.openingHours.create({ data: { restaurantId: r.id, dayOfWeek: d, service: p.service, ...data } });
    }
  }
  const local = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
  const fmt = (t: string) => { const [h, m] = t.split(":").map(Number); return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(2000, 0, 1, h, m)); };
  console.log(`Target: ${r.name} (${r.email}, ${tz})`);
  console.log(`NOW: ${local}`);
  console.log(`  GENERAL opens at ${fmt(times.general)}  (~${GENERAL_OFFSET_MIN} min from now) → store is CLOSED right now`);
  console.log(`  PICKUP opens at  ${fmt(times.pickup)}   (~2h after open)`);
  console.log(`  DELIVERY opens at ${fmt(times.delivery)} (~3h after open)`);
  console.log(`\nEXPECT: place a PICKUP order now → kitchen tile "Opens in ~10 min", NO ring. At ${fmt(times.general)} the store opens → it should RING (screen off) → accept → print.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
