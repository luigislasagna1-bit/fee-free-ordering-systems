/** READ-ONLY: Phase 3 gate evidence — the seeded assignment's full lifecycle
 *  timestamps + the driver's GPS ping timeline for the last 40 minutes.
 *  npx tsx scripts/run-on-prod.ts scripts/_gate-evidence.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" });
config({ path: ".env" });

const ASSIGNMENT_ID = "cmrpil0kv0001lwvh178oy9yn";
const DRIVER_EMAIL = "support@feefreeordering.com";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const a = await p.deliveryAssignment.findUnique({
    where: { id: ASSIGNMENT_ID },
    select: { status: true, assignedAt: true, acceptedAt: true, startedAt: true, pickedUpAt: true, deliveredAt: true, failedAt: true, completedAt: true, platformFeeCents: true },
  });
  console.log("ASSIGNMENT", JSON.stringify(a, null, 1));
  const d = await p.driver.findUnique({ where: { email: DRIVER_EMAIL }, select: { id: true, deliveredCount: true, ratingPct: true, lastLocationAt: true } });
  console.log("DRIVER", JSON.stringify(d, null, 1));
  const pings = await p.driverLocation.findMany({
    where: { driverId: d!.id, recordedAt: { gte: new Date(Date.now() - 40 * 60000) } },
    orderBy: { recordedAt: "asc" },
    select: { recordedAt: true },
    take: 200,
  });
  console.log(`PINGS (${pings.length} in last 40min):`);
  let prev: number | null = null;
  for (const x of pings) {
    const t = x.recordedAt.getTime();
    const gap = prev ? Math.round((t - prev) / 1000) : 0;
    console.log(`  ${x.recordedAt.toISOString().slice(11, 19)}${prev ? ` (+${gap}s)` : ""}${gap > 30 ? "  <-- GAP" : ""}`);
    prev = t;
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
