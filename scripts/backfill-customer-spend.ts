/**
 * Recompute every Customer's lifetime counters FROM REAL ORDERS.
 *
 *   totalOrders      — how many orders they actually placed here
 *   totalSpent       — GROSS order value (sum of Order.total)
 *   totalCreditSpent — store credit ("Luigi Bucks") they TENDERED (sum of
 *                      Order.creditApplied)
 *
 * Why this exists:
 *   1. `totalCreditSpent` is new (2026-08-07) and starts at 0 for every
 *      existing row, so history has to be filled in once.
 *   2. The existing counters were already wrong in two ways the code admitted
 *      to: a customer's FIRST order never counted (the create path seeded them
 *      at zero while only the returning-customer path incremented), and nothing
 *      ever decremented them when an order was later rejected or cancelled — so
 *      they drifted high. Recomputing fixes both.
 *
 * ⚠️  THIS SCRIPT NEVER TOUCHES A WALLET.
 *     It reads Order rows and writes exactly three DISPLAY columns on Customer.
 *     `RewardAccount.balance`, `RewardAccount.lifetimeEarned/Redeemed` and
 *     `RewardLedger` are never read and never written. A customer cannot lose
 *     (or gain) a single Luigi Buck as a result of running this. Luigi asked for
 *     that guarantee explicitly — do not relax it.
 *
 * Counted orders use the canonical reporting predicate: rejected + cancelled
 * orders and TEST- orders don't count as spend.
 *
 * Safe to re-run; idempotent; batched.
 *
 *   DRY RUN (default — reads only, writes NOTHING):
 *     npx tsx scripts/run-on-prod.ts scripts/backfill-customer-spend.ts
 *   APPLY:
 *     npx tsx scripts/run-on-prod.ts scripts/backfill-customer-spend.ts --apply
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");
const BATCH = 500;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  console.log(APPLY ? "MODE: APPLY (will write)\n" : "MODE: DRY RUN (no writes)\n");

  // One grouped pass over the order table — NOT per-customer queries.
  const grouped = await prisma.order.groupBy({
    by: ["customerId"],
    where: {
      customerId: { not: null },
      status: { notIn: ["rejected", "cancelled"] },
      orderNumber: { not: { startsWith: "TEST-" } },
    },
    _count: { _all: true },
    _sum: { total: true, creditApplied: true },
  });
  const truth = new Map(
    grouped.map((g) => [
      g.customerId!,
      {
        orders: g._count._all,
        spent: round2(g._sum.total ?? 0),
        credit: round2(g._sum.creditApplied ?? 0),
      },
    ]),
  );
  console.log(`Orders grouped for ${truth.size} customer(s).`);

  let scanned = 0;
  let drifted = 0;
  let written = 0;
  const samples: string[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await prisma.customer.findMany({
      where: cursor ? { id: { gt: cursor } } : {},
      orderBy: { id: "asc" },
      take: BATCH,
      select: { id: true, name: true, email: true, totalOrders: true, totalSpent: true, totalCreditSpent: true },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;

    for (const c of page) {
      scanned++;
      const want = truth.get(c.id) ?? { orders: 0, spent: 0, credit: 0 };
      const same =
        c.totalOrders === want.orders &&
        round2(c.totalSpent) === want.spent &&
        round2(c.totalCreditSpent ?? 0) === want.credit;
      if (same) continue;
      drifted++;
      if (samples.length < 25) {
        samples.push(
          `  ${(c.name || c.email || c.id).slice(0, 32).padEnd(34)}` +
            `orders ${c.totalOrders}→${want.orders}   ` +
            `spent ${round2(c.totalSpent)}→${want.spent}   ` +
            `credit ${round2(c.totalCreditSpent ?? 0)}→${want.credit}`,
        );
      }
      if (APPLY) {
        await prisma.customer.update({
          where: { id: c.id },
          data: { totalOrders: want.orders, totalSpent: want.spent, totalCreditSpent: want.credit },
        });
        written++;
      }
    }
    process.stdout.write(`  …scanned ${scanned}\r`);
  }

  console.log(`\n\nScanned ${scanned} customer(s); ${drifted} need correcting.`);
  if (samples.length > 0) {
    console.log(`\nSample of what changes${drifted > samples.length ? ` (first ${samples.length} of ${drifted})` : ""}:`);
    for (const s of samples) console.log(s);
  }
  console.log(
    APPLY
      ? `\n✅ Wrote ${written} customer row(s). Wallets untouched.`
      : `\nDRY RUN — nothing written. Re-run with --apply to write. Wallets are never touched either way.`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
