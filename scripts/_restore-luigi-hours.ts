/** Restore Luigi's ORIGINAL opening hours from the backup taken before testing.
 *    npx tsx scripts/run-on-prod.ts scripts/_restore-luigi-hours.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
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

  const backup = JSON.parse(readFileSync("scripts/_luigi-hours-backup.json", "utf8")) as {
    restaurantId: string; slug: string; rows: any[];
  };
  console.log(`Restoring ${backup.rows.length} rows to ${backup.slug} (${backup.restaurantId})...`);
  for (const row of backup.rows) {
    const data = {
      isOpen: row.isOpen, openTime: row.openTime, closeTime: row.closeTime,
      closesNextDay: row.closesNextDay, intervals: row.intervals ?? null,
    };
    const existing = await prisma.openingHours.findFirst({
      where: { restaurantId: backup.restaurantId, dayOfWeek: row.dayOfWeek, service: row.service ?? null },
      select: { id: true },
    });
    if (existing) await prisma.openingHours.update({ where: { id: existing.id }, data });
    else await prisma.openingHours.create({ data: { restaurantId: backup.restaurantId, dayOfWeek: row.dayOfWeek, service: row.service ?? null, ...data } });
  }
  console.log("✓ Restored. Verifying GENERAL rows:");
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = await prisma.openingHours.findMany({ where: { restaurantId: backup.restaurantId, service: null }, orderBy: { dayOfWeek: "asc" } });
  for (const h of now) console.log(`  ${dows[h.dayOfWeek]} isOpen=${h.isOpen} ${h.openTime}-${h.closeTime} nextDay=${h.closesNextDay}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
