/**
 * One-time backfill: recompute Customer.totalOrders / totalSpent /
 * totalCreditSpent from the order table for EVERY customer, using the same
 * canonical predicate the reports use (drops rejected/cancelled + TEST-).
 *
 * Why (Luigi 2026-08-09): the counters were incremented at order CREATE and
 * never adjusted when an order was later rejected/cancelled, so every customer
 * with a killed order is overcounted — the admin Customers list showed a
 * cancelled $176.46 order inside "Collected" forever. The kill flows now
 * self-heal via src/lib/customer-totals.ts; this script repairs the drift that
 * already exists.
 *
 * NEVER touches wallets, orders, or any other table — writes ONLY the three
 * counter columns on Customer, and only for rows whose stored values differ
 * from the recomputed truth.
 *
 *   DRY RUN (prints drift stats + the biggest corrections, writes nothing):
 *     npx tsx scripts/run-on-prod.ts scripts/backfill-customer-lifetime-totals.ts
 *   APPLY:
 *     npx tsx scripts/run-on-prod.ts scripts/backfill-customer-lifetime-totals.ts --write
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const WRITE = process.argv.includes("--write");
const EPS = 0.005; // float compare for money columns

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  // Canonical predicate — keep identical to REPORT_ORDER_STATUS_WHERE
  // (src/lib/reports/order-filter.ts). Inlined because this script runs
  // standalone against either branch.
  const truth = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      customerId: { not: null },
      status: { notIn: ["rejected", "cancelled"] },
      orderNumber: { not: { startsWith: "TEST-" } },
    },
    _count: true,
    _sum: { total: true, creditApplied: true },
  });
  const truthById = new Map(
    truth.map((t) => [
      t.customerId!,
      { orders: t._count, spent: t._sum.total ?? 0, credit: t._sum.creditApplied ?? 0 },
    ]),
  );

  const drifted: Array<{
    id: string; restaurantId: string; name: string | null;
    from: { orders: number; spent: number; credit: number };
    to: { orders: number; spent: number; credit: number };
  }> = [];

  let scanned = 0;
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.customer.findMany({
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      select: { id: true, restaurantId: true, name: true, totalOrders: true, totalSpent: true, totalCreditSpent: true },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;
    scanned += batch.length;

    for (const c of batch) {
      const t = truthById.get(c.id) ?? { orders: 0, spent: 0, credit: 0 };
      const diff =
        c.totalOrders !== t.orders ||
        Math.abs(c.totalSpent - t.spent) > EPS ||
        Math.abs((c.totalCreditSpent ?? 0) - t.credit) > EPS;
      if (diff) {
        drifted.push({
          id: c.id, restaurantId: c.restaurantId, name: c.name,
          from: { orders: c.totalOrders, spent: c.totalSpent, credit: c.totalCreditSpent ?? 0 },
          to: t,
        });
      }
    }
  }

  console.log(`Scanned ${scanned} customers · ${drifted.length} drifted`);

  const byRestaurant = new Map<string, number>();
  for (const d of drifted) byRestaurant.set(d.restaurantId, (byRestaurant.get(d.restaurantId) ?? 0) + 1);
  console.log("Drifted per restaurant:");
  for (const [rid, n] of byRestaurant) console.log(`  ${rid}: ${n}`);

  const top = [...drifted]
    .sort((a, b) => Math.abs(b.from.spent - b.to.spent) - Math.abs(a.from.spent - a.to.spent))
    .slice(0, 10);
  console.log("Top 10 corrections by |spent| delta:");
  for (const d of top) {
    console.log(
      `  ${d.name ?? "(no name)"} · orders ${d.from.orders}→${d.to.orders} · spent ${d.from.spent.toFixed(2)}→${d.to.spent.toFixed(2)} · credit ${d.from.credit.toFixed(2)}→${d.to.credit.toFixed(2)}`,
    );
  }

  // Sanity rail: this bug only ever OVERCOUNTS (orders can't gain money by
  // being cancelled), so a customer whose recomputed spend is HIGHER than the
  // stored counter means something else is off (e.g. orders re-linked to a
  // different customer row). Flag them; they still get corrected — the order
  // table is the truth either way — but they deserve eyes.
  const increased = drifted.filter((d) => d.to.spent - d.from.spent > EPS);
  if (increased.length > 0) {
    console.log(`⚠️  ${increased.length} customer(s) INCREASE — counters were UNDER the truth (first 5):`);
    for (const d of increased.slice(0, 5)) {
      console.log(`  ${d.name ?? "(no name)"} · spent ${d.from.spent.toFixed(2)}→${d.to.spent.toFixed(2)}`);
    }
  }

  if (!WRITE) {
    console.log("🔍 DRY RUN — nothing written. Re-run with --write to apply.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const d of drifted) {
    await prisma.customer.update({
      where: { id: d.id },
      data: { totalOrders: d.to.orders, totalSpent: d.to.spent, totalCreditSpent: d.to.credit },
    });
    updated++;
  }
  console.log(`✅ updated ${updated} customer(s)`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
