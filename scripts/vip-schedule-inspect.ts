/**
 * READ-ONLY inspector for VIP Automations (VipSchedule) — MONDAY_PLAN test #6.
 * Lists every schedule (kind/amount/cadence/next-run/last-run/active) and, for a
 * credit_grant on a group, each member (registered / email / phone-only) with
 * their CURRENT Reward Dollars balance. Run before + after firing the cron to see
 * grants land once. Writes nothing.
 *
 * Usage: npx tsx scripts/run-on-prod.ts scripts/vip-schedule-inspect.ts <store-slug>
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaNeon } from "@prisma/adapter-neon";
const cs = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: /\.neon\.tech([:/?]|$)/i.test(cs) ? new PrismaNeon({ connectionString: cs }) : new PrismaPg({ connectionString: cs }) } as any);
const slug = process.argv[2];
const money = (n: number | null | undefined) => "$" + (n ?? 0).toFixed(2);

async function balanceFor(restaurantId: string, customerId: string | null, email: string | null): Promise<string> {
  let cid = customerId;
  if (!cid && email) {
    const c = await prisma.customer.findFirst({ where: { restaurantId, email: { equals: email, mode: "insensitive" } }, select: { id: true } });
    cid = c?.id ?? null;
  }
  if (!cid) return "(no wallet — not a registered customer yet)";
  const a = await prisma.rewardAccount.findUnique({ where: { restaurantId_customerId: { restaurantId, customerId: cid } }, select: { balance: true } });
  return money(a?.balance ?? 0);
}

async function main() {
  if (!slug) { console.error("Usage: ... scripts/vip-schedule-inspect.ts <store-slug>"); process.exit(1); }
  const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true, timezone: true, rewardsEnabled: true } });
  if (!r) { console.error(`No restaurant "${slug}".`); process.exit(1); }
  console.log(`\n=== ${r.name} — VIP Automations ===  tz=${r.timezone}  rewardsEnabled=${r.rewardsEnabled}\n`);

  const schedules = await prisma.vipSchedule.findMany({
    where: { restaurantId: r.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, amount: true, cadence: true, sendHour: true, active: true, nextRunAt: true, lastRunAt: true, lastFiredDateKey: true, runCount: true, groupId: true, customerId: true, email: true, group: { select: { name: true } } },
  });
  if (!schedules.length) { console.log("(no VIP schedules yet)"); return; }

  for (const s of schedules) {
    console.log(`• [${s.active ? "ACTIVE" : "off"}] ${s.kind}  ${s.kind === "credit_grant" ? money(s.amount) : ""}  cadence=${s.cadence}@${s.sendHour}  runs=${s.runCount}`);
    console.log(`   id=${s.id}`);
    console.log(`   target=${s.group ? `group "${s.group.name}"` : s.customerId ? `customer ${s.customerId}` : s.email ? `email ${s.email}` : "?"}`);
    console.log(`   nextRunAt=${s.nextRunAt?.toISOString() ?? "—"}  lastRunAt=${s.lastRunAt?.toISOString() ?? "—"}  lastFiredDateKey=${s.lastFiredDateKey ?? "—"}`);
    if (s.kind === "credit_grant" && s.groupId) {
      const members = await prisma.customerGroupMember.findMany({ where: { groupId: s.groupId }, select: { customerId: true, email: true, phone: true, name: true } });
      console.log(`   members (${members.length}):`);
      for (const m of members) {
        const type = m.customerId ? "registered" : m.email ? "email-only" : m.phone ? "phone-only" : "name-only";
        const bal = await balanceFor(r.id, m.customerId, m.email);
        console.log(`     - [${type}] ${m.name ?? m.email ?? m.phone ?? m.customerId}  balance=${bal}`);
      }
    }
    console.log("");
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
