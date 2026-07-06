/** Dev-only: demo-pizza-palace GENERAL hours → 10:00–03:00 overnight ("on")
 *  or restore from the snapshot taken on "on" ("off").
 *  npx tsx scripts/_toggle-demo-overnight-hours.ts on|off */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SNAP = "scripts/_demo-hours-snapshot.json";

async function main() {
  const mode = process.argv[2];
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findUnique({
    where: { slug: "demo-pizza-palace" },
    select: { id: true, openingHours: { where: { service: null } } },
  });
  if (!r) throw new Error("demo restaurant not found");

  if (mode === "on") {
    writeFileSync(SNAP, JSON.stringify(r.openingHours, null, 2));
    for (const h of r.openingHours) {
      await prisma.openingHours.update({
        where: { id: h.id },
        data: {
          isOpen: true, openTime: "10:00", closeTime: "03:00", closesNextDay: true,
          intervals: [{ open: "10:00", close: "03:00", closesNextDay: true }],
        },
      });
    }
    console.log(`✓ overnight hours ON for ${r.openingHours.length} general rows (snapshot saved)`);
  } else {
    if (!existsSync(SNAP)) throw new Error("no snapshot to restore");
    const snap = JSON.parse(readFileSync(SNAP, "utf8")) as any[];
    for (const h of snap) {
      await prisma.openingHours.update({
        where: { id: h.id },
        data: {
          isOpen: h.isOpen, openTime: h.openTime, closeTime: h.closeTime,
          closesNextDay: h.closesNextDay, intervals: h.intervals ?? undefined,
        },
      });
    }
    console.log(`✓ restored ${snap.length} general rows from snapshot`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
