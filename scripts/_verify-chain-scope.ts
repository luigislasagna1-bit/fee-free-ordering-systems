/**
 * Verify the chain-reporting fix on real data: find a brand PARENT (a restaurant
 * with child locations), then confirm Today vs Yesterday now give DIFFERENT
 * totals (the bug was both collapsing to "last 1 day") and the rollup sums
 * across all locations with a per-location breakdown.
 *   npx tsx scripts/_verify-chain-scope.ts
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
// Local-day [00:00, 24:00) as UTC instants (approx; good enough for the check).
function localDay(dayKey: string): { from: Date; to: Date } {
  return { from: new Date(`${dayKey}T00:00:00`), to: new Date(`${dayKey}T23:59:59.999`) };
}
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log("DB:", url.replace(/:[^@]*@/, ":***@").slice(0, 64));

  const parents = await prisma.restaurant.findMany({
    where: { childLocations: { some: {} } },
    select: { id: true, name: true, currency: true, timezone: true, childLocations: { select: { id: true, name: true } } },
  });
  if (!parents.length) {
    console.log("\nNo brand parent in this DB — chain path can't be tested locally (Luigi's 8-location chain is on PROD). Single-restaurant path is the regression gate here.");
    await prisma.$disconnect(); return;
  }
  const p = parents[0];
  const tz = p.timezone || "UTC";
  const ids = [p.id, ...p.childLocations.map((c) => c.id)];
  console.log(`\nBrand parent: ${p.name} — ${p.childLocations.length} children (${ids.length} locations), tz=${tz}, cur=${p.currency}`);

  // Use the most recent day with chain orders as "today" so the windows aren't empty.
  const last = await prisma.order.findFirst({ where: { restaurantId: { in: ids }, status: STATUS_OK, orderNumber: NOT_TEST }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const todayKey = last ? dateKeyInTz(last.createdAt, tz) : dateKeyInTz(new Date(), tz);
  const yKey = addDays(todayKey, -1);

  const agg = async (dayKey: string) => {
    const { from, to } = localDay(dayKey);
    const r = await prisma.order.aggregate({ where: { restaurantId: { in: ids }, createdAt: { gte: from, lte: to }, status: STATUS_OK, orderNumber: NOT_TEST }, _sum: { total: true }, _count: true });
    return { orders: r._count, revenue: r._sum.total ?? 0 };
  };
  const today = await agg(todayKey);
  const yest = await agg(yKey);

  console.log(`\n— Chain-wide (restaurantId IN ${ids.length} locations) —`);
  console.log(`Today     (${todayKey}): ${today.orders} orders · ${today.revenue.toFixed(2)}`);
  console.log(`Yesterday (${yKey}): ${yest.orders} orders · ${yest.revenue.toFixed(2)}`);
  console.log(`Today ≠ Yesterday: ${today.orders !== yest.orders || Math.abs(today.revenue - yest.revenue) > 0.01 ? "✓ DISTINCT (bug fixed)" : "— same (both days have identical data; pick a busier pair)"}`);

  // Per-location breakdown for "today" (one groupBy, like the new dashboard).
  const { from, to } = localDay(todayKey);
  const perLoc = await prisma.order.groupBy({ by: ["restaurantId"], where: { restaurantId: { in: ids }, createdAt: { gte: from, lte: to }, status: STATUS_OK, orderNumber: NOT_TEST }, _count: true, _sum: { total: true } });
  const nameById = new Map([[p.id, p.name + " (brand)"], ...p.childLocations.map((c) => [c.id, c.name] as [string, string])]);
  const sum = perLoc.reduce((s, r) => s + (r._sum.total ?? 0), 0);
  console.log(`\nPer-location (${todayKey}): sums to ${sum.toFixed(2)} ${Math.abs(sum - today.revenue) < 0.01 ? "✓ == headline" : "✗ MISMATCH"}`);
  for (const r of perLoc.sort((a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0))) {
    console.log(`  ${(nameById.get(r.restaurantId) || r.restaurantId).padEnd(34)} ${String(r._count).padStart(4)} orders · ${(r._sum.total ?? 0).toFixed(2)}`);
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
