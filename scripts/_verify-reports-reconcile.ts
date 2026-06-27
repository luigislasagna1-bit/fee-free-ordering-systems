/**
 * Verify the Reports accuracy refactor on real seeded data:
 *   Dashboard total === Summary day-sum === List count (one canonical predicate),
 *   and show how much the number MOVED vs the old "completed-only" definition.
 *   npx tsx scripts/_verify-reports-reconcile.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const STATUS_OK = { notIn: ["rejected", "cancelled"] };
const NOT_TEST = { not: { startsWith: "TEST-" } };

function dateKeyInTz(d: Date, tz: string): string {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
  } catch { return d.toISOString().slice(0, 10); }
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log("DB:", url.replace(/:[^@]*@/, ":***@").slice(0, 64));

  const top = await prisma.order.groupBy({ by: ["restaurantId"], _count: true, orderBy: { _count: { restaurantId: "desc" } }, take: 1 });
  if (!top.length) { console.log("no orders in this DB"); await prisma.$disconnect(); return; }
  const rid = top[0].restaurantId;
  const r = await prisma.restaurant.findUnique({ where: { id: rid }, select: { name: true, slug: true, timezone: true, currency: true } });
  const tz = r?.timezone || "UTC";
  console.log(`Restaurant: ${r?.name} (${r?.slug}) tz=${tz} cur=${r?.currency} — ${top[0]._count} orders total\n`);

  // Use the restaurant's full order span so the seeded (older) data isn't empty.
  const span = await prisma.order.aggregate({ where: { restaurantId: rid }, _min: { createdAt: true }, _max: { createdAt: true } });
  const from = span._min.createdAt ?? new Date(0);
  const to = span._max.createdAt ?? new Date();
  const fromKey = dateKeyInTz(from, tz), todayKey = dateKeyInTz(to, tz);
  const whereCanon = { restaurantId: rid, createdAt: { gte: from, lte: to }, status: STATUS_OK, orderNumber: NOT_TEST };

  const agg = await prisma.order.aggregate({ where: whereCanon, _sum: { total: true }, _count: true });
  const A_rev = agg._sum.total ?? 0, A_ord = agg._count;

  const oldAgg = await prisma.order.aggregate({ where: { restaurantId: rid, createdAt: { gte: from, lte: to }, status: "completed" }, _sum: { total: true }, _count: true });

  const orders = await prisma.order.findMany({ where: whereCanon, select: { total: true, createdAt: true } });
  let B_rev = 0, B_ord = 0; const byDay = new Map<string, number>();
  for (const o of orders) { B_rev += o.total; B_ord++; const k = dateKeyInTz(o.createdAt, tz); byDay.set(k, (byDay.get(k) || 0) + o.total); }

  const C = await prisma.order.count({ where: whereCanon });
  const allCount = await prisma.order.count({ where: { restaurantId: rid, createdAt: { gte: from, lte: to } } });

  const recon = Math.abs(A_rev - B_rev) < 0.01 && A_ord === B_ord && C === A_ord;
  console.log(`— Full data span (${fromKey} → ${todayKey}) —`);
  console.log(`Dashboard (canonical):  ${A_ord} orders · ${A_rev.toFixed(2)}`);
  console.log(`Summary day-sum:        ${B_ord} orders · ${B_rev.toFixed(2)}`);
  console.log(`List count:             ${C} orders`);
  console.log(`RECONCILES: ${recon ? "✓ all three match" : "✗ MISMATCH"}`);
  console.log(`\nAll statuses incl test/rejected: ${allCount}  →  excluded ${allCount - A_ord} noise order(s)`);
  console.log(`OLD "completed-only" def:        ${oldAgg._count} orders · ${(oldAgg._sum.total ?? 0).toFixed(2)}`);
  console.log(`  delta (new − old): ${A_ord - oldAgg._count} orders · ${(A_rev - (oldAgg._sum.total ?? 0)).toFixed(2)} (this is how much the headline "moves")`);
  console.log(`\nDaily buckets (tz ${tz}): ${[...byDay.entries()].sort().map(([k, v]) => `${k.slice(5)}=${v.toFixed(0)}`).join("  ")}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
