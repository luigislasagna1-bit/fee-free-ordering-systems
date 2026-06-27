/** Set up (and later restore) the "opening hours per service" LIVE TEST on Luigi's Toronto HQ.
 *  TEST scenario (today): GENERAL open now (10:00-23:59), Pickup opens 23:40, Delivery opens 23:50,
 *  scheduled-orders ON — so right now the restaurant is "open" but both services are "not yet open".
 *    set:     npx tsx scripts/run-on-prod.ts scripts/_setup-hours-test.ts
 *    restore: npx tsx scripts/run-on-prod.ts scripts/_setup-hours-test.ts --restore
 */
import { config } from "dotenv";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { writeFileSync, readFileSync, existsSync } from "fs";

config({ path: ".env.local" });
config({ path: ".env" });

const RID = "cmp7xhd3900000al2jz0db5vi"; // Luigi's Lasagna — Toronto (brand HQ)
const TZ = "America/Toronto";
const BACKUP = "scripts/_hours-backup.json";
const RESTORE = process.argv.includes("--restore");

const DOW: Record<string, number> = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
function todayDow(tz: string) {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date());
  return DOW[wd];
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const dow = todayDow(TZ);

  if (RESTORE) {
    if (!existsSync(BACKUP)) { console.log("No backup file — nothing to restore."); await prisma.$disconnect(); return; }
    const saved = JSON.parse(readFileSync(BACKUP, "utf8"));
    for (const row of saved.rows) {
      await prisma.openingHours.update({ where: { id: row.id }, data: {
        isOpen: row.isOpen, openTime: row.openTime, closeTime: row.closeTime, closesNextDay: row.closesNextDay,
        intervals: row.intervals === null || row.intervals === undefined ? Prisma.DbNull : row.intervals,
      } });
      console.log(`  restored ${row.service ?? "GENERAL"}: ${row.openTime}-${row.closeTime} closesNextDay=${row.closesNextDay}`);
    }
    if (saved.allowScheduledOrders !== undefined) {
      await prisma.restaurant.update({ where: { id: RID }, data: { allowScheduledOrders: saved.allowScheduledOrders } });
      console.log(`  restored allowScheduledOrders=${saved.allowScheduledOrders}`);
    }
    console.log("✓ RESTORED original hours + scheduled-orders flag.");
    await prisma.$disconnect();
    return;
  }

  // BACKUP current rows + scheduled-orders flag
  const services: (string | null)[] = [null, "pickup", "delivery"];
  const rows: any[] = [];
  for (const svc of services) {
    const r = await prisma.openingHours.findFirst({ where: { restaurantId: RID, dayOfWeek: dow, service: svc } });
    if (r) rows.push(r);
  }
  const rest: any = await prisma.restaurant.findUnique({ where: { id: RID }, select: { allowScheduledOrders: true } });
  writeFileSync(BACKUP, JSON.stringify({ rid: RID, dow, savedAt: new Date().toISOString(), rows, allowScheduledOrders: rest?.allowScheduledOrders }, null, 2));
  console.log(`Backed up ${rows.length} hour row(s) + allowScheduledOrders=${rest?.allowScheduledOrders} → ${BACKUP}\n`);

  // SET test scenario (today)
  const test = [
    { service: null,       label: "GENERAL ", open: "10:00", close: "23:59" },
    { service: "pickup",   label: "PICKUP  ", open: "23:40", close: "23:59" },
    { service: "delivery", label: "DELIVERY", open: "23:50", close: "23:59" },
  ];
  for (const t of test) {
    const data = { isOpen: true, openTime: t.open, closeTime: t.close, closesNextDay: false, intervals: [{ open: t.open, close: t.close }] as any };
    const existing = await prisma.openingHours.findFirst({ where: { restaurantId: RID, dayOfWeek: dow, service: t.service } });
    if (existing) await prisma.openingHours.update({ where: { id: existing.id }, data });
    else await prisma.openingHours.create({ data: { restaurantId: RID, dayOfWeek: dow, service: t.service, ...data } });
    console.log(`  set ${t.label} ${t.open}-${t.close}`);
  }
  await prisma.restaurant.update({ where: { id: RID }, data: { allowScheduledOrders: true } });
  console.log(`  set allowScheduledOrders=true`);
  console.log(`\n✓ TEST LIVE (dow=${dow}): restaurant OPEN now · Pickup opens 11:40 PM · Delivery opens 11:50 PM.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
