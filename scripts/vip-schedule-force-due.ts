/**
 * Make a VipSchedule fire on the NEXT cron tick — sets nextRunAt to now and
 * clears lastFiredDateKey so the per-day guard doesn't suppress it. For testing
 * the scheduler immediately instead of waiting for its scheduled hour
 * (MONDAY_PLAN test #6). Targets ONE schedule by id; nothing else changes.
 *
 * Usage: npx tsx scripts/run-on-prod.ts scripts/vip-schedule-force-due.ts <scheduleId>
 * (get the id from scripts/vip-schedule-inspect.ts)
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaNeon } from "@prisma/adapter-neon";
const cs = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: /\.neon\.tech([:/?]|$)/i.test(cs) ? new PrismaNeon({ connectionString: cs }) : new PrismaPg({ connectionString: cs }) } as any);
const id = process.argv[2];

async function main() {
  if (!id) { console.error("Usage: ... scripts/vip-schedule-force-due.ts <scheduleId>"); process.exit(1); }
  const before = await prisma.vipSchedule.findUnique({ where: { id }, select: { id: true, kind: true, cadence: true, active: true, nextRunAt: true, lastFiredDateKey: true } });
  if (!before) { console.error(`No VipSchedule with id "${id}".`); process.exit(1); }
  await prisma.vipSchedule.update({
    where: { id },
    data: { active: true, nextRunAt: new Date(0), lastFiredDateKey: null },
  });
  const after = await prisma.vipSchedule.findUnique({ where: { id }, select: { nextRunAt: true, active: true, lastFiredDateKey: true } });
  console.log(`Schedule ${id} (${before.kind}/${before.cadence}) forced due:`);
  console.log(`  nextRunAt: ${before.nextRunAt?.toISOString() ?? "—"} → ${after!.nextRunAt?.toISOString()}  active=${after!.active}  lastFiredDateKey=${after!.lastFiredDateKey ?? "null"}`);
  console.log(`\nNow trigger the cron (superadmin browser): https://feefreeordering.com/api/cron/vip-schedules`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
