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
 * The drift in (2) accrues continuously, so the same recompute now also runs
 * nightly at /api/cron/customer-spend-recompute. BOTH call the one shared
 * `recomputeCustomerSpend()` in src/lib/customer-spend-recompute.ts — this
 * script is a thin console wrapper around it and must stay that way, so the
 * scheduled job and the manual job can never disagree.
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
import { recomputeCustomerSpend } from "../src/lib/customer-spend-recompute";

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  console.log(APPLY ? "MODE: APPLY (will write)\n" : "MODE: DRY RUN (no writes)\n");

  const result = await recomputeCustomerSpend(prisma, {
    apply: APPLY,
    onProgress: (scanned) => process.stdout.write(`  …scanned ${scanned}\r`),
  });

  console.log(`Orders grouped for ${result.groupedCustomers} customer(s).`);
  console.log(`\nScanned ${result.scanned} customer(s); ${result.drifted} need correcting.`);

  if (result.samples.length > 0) {
    const more = result.drifted > result.samples.length ? ` (first ${result.samples.length} of ${result.drifted})` : "";
    console.log(`\nSample of what changes${more}:`);
    for (const s of result.samples) {
      console.log(
        `  ${s.label.slice(0, 32).padEnd(34)}` +
          `orders ${s.from.orders}→${s.to.orders}   ` +
          `spent ${s.from.spent}→${s.to.spent}   ` +
          `credit ${s.from.credit}→${s.to.credit}`,
      );
    }
  }

  if (result.failed > 0) console.log(`\n⚠️  ${result.failed} row(s) failed to update — see errors above.`);

  console.log(
    APPLY
      ? `\n✅ Wrote ${result.written} customer row(s). Wallets untouched.`
      : `\nDRY RUN — nothing written. Re-run with --apply to write. Wallets are never touched either way.`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
