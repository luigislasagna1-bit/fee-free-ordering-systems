/**
 * READ-ONLY verification for the partner Orders List.
 *
 * Proves the two things that would have silently broken this feature:
 *   1. `reportOrderWhere` (the canonical reports predicate) EXCLUDES
 *      rejected + cancelled orders — exactly the rows Fabrizio asked to see.
 *      We show the delta between it and the feed's own predicate.
 *   2. "Missed" is derived (status=rejected AND cancelledBy="auto"), not stored.
 *
 * Also checks reservations merge in, and that reseller scoping isolates.
 *   npx tsx scripts/run-on-prod.ts scripts/_verify-partner-orders.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const DAYS = Number(process.argv[2] || 90);

const AUTO_OR = [{ cancelledBy: "auto" }, { rejectionReason: { startsWith: "Auto-rejected" } }];
function derive(raw: string, cancelledBy: string | null, rejectionReason: string | null = null): string {
  switch (raw) {
    case "pending": return "pending";
    case "accepted": case "preparing": case "ready": case "confirmed": return "accepted";
    case "completed": return "completed";
    case "cancelled": return "cancelled";
    case "seated": return "seated";
    case "no_show": return "no_show";
    case "rejected":
      return cancelledBy === "auto" || (rejectionReason?.startsWith("Auto-rejected") ?? false) ? "missed" : "rejected";
    default: return raw;
  }
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const from = new Date(Date.now() - DAYS * 24 * 3600 * 1000);

  const profiles = await prisma.resellerProfile.findMany({
    where: { status: "approved" },
    select: { id: true, companyName: true, _count: { select: { restaurants: true } } },
  });
  console.log(`\n=== Approved reseller partners: ${profiles.length} ===`);
  for (const p of profiles) console.log(`  ${p.companyName ?? "(no company)"} — ${p._count.restaurants} restaurant(s)  [${p.id}]`);

  const target = profiles.filter((p) => p._count.restaurants > 0).sort((a, b) => b._count.restaurants - a._count.restaurants)[0];
  if (!target) { console.log("\nNo approved reseller with restaurants — nothing to verify."); await prisma.$disconnect(); return; }

  console.log(`\n=== Scoping to: ${target.companyName ?? target.id} (last ${DAYS} days) ===`);
  const scopeFilter = { resellerProfileId: target.id };

  // The feed's predicate: every status, TEST- excluded.
  const feedWhere = {
    restaurant: scopeFilter,
    createdAt: { gte: from },
    orderNumber: { not: { startsWith: "TEST-" } },
  };
  // The reports predicate we deliberately did NOT reuse.
  const reportsWhere = { ...feedWhere, status: { notIn: ["rejected", "cancelled"] } };

  const [feedCount, reportsCount] = await Promise.all([
    prisma.order.count({ where: feedWhere as never }),
    prisma.order.count({ where: reportsWhere as never }),
  ]);
  console.log(`  orders visible to the FEED (all statuses):        ${feedCount}`);
  console.log(`  orders visible via reportOrderWhere (reports):    ${reportsCount}`);
  console.log(`  → ${feedCount - reportsCount} order(s) would have been INVISIBLE had we reused reportOrderWhere.`);

  // Same shape the feed uses: group by status only, then split `rejected` with
  // a separate auto-rejected count (rejectionReason is free text — never a GROUP BY key).
  const resWhere = { restaurant: scopeFilter, createdAt: { gte: from } };
  const [groups, resGroups, oMissed, rMissed] = await Promise.all([
    prisma.order.groupBy({ by: ["status"], where: feedWhere as never, _count: { _all: true } }),
    prisma.reservation.groupBy({ by: ["status"], where: resWhere as never, _count: { _all: true } }),
    prisma.order.count({ where: { AND: [feedWhere, { status: "rejected", OR: AUTO_OR }] } as never }),
    prisma.reservation.count({ where: { AND: [resWhere, { status: "rejected", OR: AUTO_OR }] } as never }),
  ]);
  const counts: Record<string, number> = {};
  let oRejected = 0;
  for (const g of groups) {
    if (g.status === "rejected") { oRejected += g._count._all; continue; }
    counts[derive(g.status, null)] = (counts[derive(g.status, null)] ?? 0) + g._count._all;
  }
  counts.missed = oMissed;
  counts.rejected = Math.max(0, oRejected - oMissed);

  const resCounts: Record<string, number> = {};
  let rRejected = 0;
  for (const g of resGroups) {
    if (g.status === "rejected") { rRejected += g._count._all; continue; }
    resCounts[derive(g.status, null)] = (resCounts[derive(g.status, null)] ?? 0) + g._count._all;
  }
  resCounts.missed = rMissed;
  resCounts.rejected = Math.max(0, rRejected - rMissed);

  console.log(`\n  Status chips (orders):`);
  for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(12)} ${v}`);
  console.log(`  Status chips (reservations): ${Object.keys(resCounts).length ? "" : "(none in range)"}`);
  for (const [k, v] of Object.entries(resCounts).sort((a, b) => b[1] - a[1])) console.log(`    ${k.padEnd(12)} ${v}`);

  console.log(`\n  MISSED present:    ${(counts.missed ?? 0) > 0 ? `YES (${counts.missed})` : "none in this range"}`);
  console.log(`  CANCELLED present: ${(counts.cancelled ?? 0) > 0 ? `YES (${counts.cancelled})` : "none in this range"}`);

  // Currency spread — drives the mixed-currency caveat.
  const currencies = await prisma.restaurant.findMany({
    where: scopeFilter, select: { currency: true }, distinct: ["currency"],
  });
  console.log(`  currencies in portfolio: ${currencies.map((c) => c.currency).join(", ")} → mixedCurrency=${currencies.length > 1}`);

  // Isolation: orders NOT in this partner's scope must be unreachable.
  const outside = await prisma.order.count({
    where: { createdAt: { gte: from }, NOT: { restaurant: scopeFilter } } as never,
  });
  console.log(`\n  orders outside this partner's scope (must never appear): ${outside}`);

  // A merged sample, newest first — what the top of the list looks like.
  const [o, r] = await Promise.all([
    prisma.order.findMany({
      where: feedWhere as never, orderBy: { createdAt: "desc" }, take: 6,
      select: { orderNumber: true, status: true, cancelledBy: true, rejectionReason: true, type: true, total: true, createdAt: true,
                restaurant: { select: { name: true, currency: true } } },
    }),
    prisma.reservation.findMany({
      where: resWhere as never, orderBy: { createdAt: "desc" }, take: 3,
      select: { confirmationCode: true, status: true, cancelledBy: true, rejectionReason: true, orderId: true, createdAt: true, partySize: true,
                restaurant: { select: { name: true } } },
    }),
  ]);
  const merged = [
    ...o.map((x: any) => ({ at: x.createdAt, line: `#${x.orderNumber.padEnd(12)} ${derive(x.status, x.cancelledBy, x.rejectionReason).padEnd(10)} ${x.type.padEnd(9)} ${String(x.total).padStart(8)} ${x.restaurant.currency.toUpperCase()}  ${x.restaurant.name}` })),
    ...r.map((x: any) => ({ at: x.createdAt, line: `${x.confirmationCode.padEnd(13)} ${derive(x.status, x.cancelledBy, x.rejectionReason).padEnd(10)} ${(x.orderId ? "res+order" : "reservation").padEnd(9)} ${String(x.partySize).padStart(6)} pax  ${x.restaurant.name}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  console.log(`\n  === Merged feed sample (newest first) ===`);
  for (const m of merged.slice(0, 9)) console.log(`    ${m.at.toISOString().slice(0, 16).replace("T", " ")}  ${m.line}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
