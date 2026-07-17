/**
 * READ-ONLY: live-watch a driver's GPS pings during the v1.1 Phase 3 device
 * gate (flip tabs / lock phone — pings must keep landing). Samples every 8s
 * for ~4 minutes: last ping age, total pings in the trailing 2 minutes, and
 * the delta since the previous sample.
 *   npx tsx scripts/run-on-prod.ts scripts/_watch-driver-pings.ts [driverEmail]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

const EMAIL = process.argv[2] || "support@feefreeordering.com";
const SAMPLES = 30;
const INTERVAL_MS = 8000;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const d = await p.driver.findUnique({ where: { email: EMAIL }, select: { id: true, name: true } });
  if (!d) throw new Error(`No driver with email ${EMAIL}`);
  console.log(`Watching pings for ${d.name} <${EMAIL}> — ${SAMPLES} samples @ ${INTERVAL_MS / 1000}s`);
  let prevCount = -1;
  for (let i = 1; i <= SAMPLES; i++) {
    const [drv, recent] = await Promise.all([
      p.driver.findUnique({ where: { id: d.id }, select: { lastLocationAt: true } }),
      // Drive-by fix riding in the Phase 4 (driver History) change: this filter used
      // `createdAt`, but DriverLocation's timestamp field/index is `recordedAt`
      // (schema.prisma DriverLocation) — the old field threw a Prisma unknown-argument error.
      p.driverLocation.count({ where: { driverId: d.id, recordedAt: { gte: new Date(Date.now() - 120000) } } }),
    ]);
    const age = drv?.lastLocationAt ? Math.round((Date.now() - drv.lastLocationAt.getTime()) / 1000) : null;
    const delta = prevCount < 0 ? "" : ` (+${Math.max(0, recent - prevCount)})`;
    console.log(`[${new Date().toISOString().slice(11, 19)}] sample ${String(i).padStart(2)}: last ping ${age === null ? "NEVER" : age + "s ago"} · ${recent} pings in trailing 2min${delta}`);
    prevCount = recent;
    if (i < SAMPLES) await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
