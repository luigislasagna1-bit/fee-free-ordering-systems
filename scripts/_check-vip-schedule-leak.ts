/** READ-ONLY: is any VIP credit_grant schedule still active on prod for
 *  Luigi's store, and when did the last scheduled grants actually fire?
 *  (Verifies TODO #424 "$5/day Schedule Tester leak" is truly dead.) */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  const r = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true } });
  if (!r) { console.log("restaurant not found"); return; }

  const schedules = await prisma.vipSchedule.findMany({
    where: { restaurantId: r.id },
    orderBy: { id: "desc" },
  });
  console.log(`VipSchedules for ${r.name}: ${schedules.length}`);
  for (const s of schedules as any[]) {
    console.log(`  · ${s.id} kind=${s.kind} active=${s.isActive ?? s.enabled ?? "?"} amount=${s.amount ?? "-"} cadence=${s.cadence ?? s.frequency ?? "-"} groupId=${s.groupId ?? s.customerGroupId ?? "-"} label=${s.label ?? s.name ?? "-"}`);
  }

  const recent = await prisma.vipScheduleGrant.findMany({
    where: { schedule: { restaurantId: r.id } },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { createdAt: true, periodKey: true, recipientKey: true, scheduleId: true },
  });
  console.log(`\nMost recent VipScheduleGrant rows (${recent.length}):`);
  for (const g of recent) console.log(`  · ${g.createdAt.toISOString().slice(0, 16)} period=${g.periodKey} schedule=${g.scheduleId}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
