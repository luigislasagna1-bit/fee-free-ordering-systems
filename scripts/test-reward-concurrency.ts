/**
 * Reward Dollars CONCURRENCY + idempotency test (MONDAY_PLAN test #3).
 *
 * Creates its OWN throwaway test customer + wallet (never touches a real
 * customer), then:
 *   1. Grants a known $10 balance.
 *   2. Fires 5 CONCURRENT reserveCredit() calls each wanting $4 → proves the
 *      atomic `WHERE balance >= applied` guard: total drawn ≤ $10, balance never
 *      goes negative, the losers get "insufficient" (no over-spend, no 500s).
 *   3. Fires 2 CONCURRENT grant() calls with the SAME (orderId, reason) → proves
 *      the @@unique idempotency: balance rises ONCE, exactly one ledger row.
 * Then DELETES all its test data (customer + account + ledger) — leaves the DB
 * exactly as it found it. Safe to run on prod.
 *
 * Usage:
 *   npx tsx scripts/run-on-prod.ts scripts/test-reward-concurrency.ts <store-slug>
 *   (or locally: npx tsx scripts/test-reward-concurrency.ts demo-pizza-palace)
 */
import { config as c } from "dotenv"; c({ path: ".env.local" }); c({ path: ".env" });

const slug = process.argv[2];
if (!slug) { console.error("Usage: ... scripts/test-reward-concurrency.ts <store-slug>"); process.exit(1); }

async function main() {
  const prisma = (await import("@/lib/db")).default;
  const { reserveCredit, grant, getBalance } = await import("@/lib/reward-ledger");

  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!restaurant) { console.error(`No restaurant with slug "${slug}".`); process.exit(1); }
  const restaurantId = restaurant.id;

  // ── Ephemeral test customer ───────────────────────────────────────────────
  const customer = await prisma.customer.create({
    data: { restaurantId, name: "__reward concurrency test__", email: `__concurrency_test_${slug}@feefree.test` },
    select: { id: true },
  });
  const customerId = customer.id;
  const fails: string[] = [];
  try {
    await grant({ restaurantId, customerId, amount: 10, reason: "adjust", note: "concurrency test seed" });
    const start = await getBalance({ restaurantId, customerId });
    console.log(`\nSeeded test wallet: $${start.toFixed(2)}\n`);

    // ── TEST 1: 5 concurrent spends of $4 against a $10 balance ───────────────
    console.log("TEST 1 — 5 concurrent reserveCredit($4) on a $10 balance:");
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        reserveCredit({ restaurantId, customerId, requested: 4, orderTotal: 100, minRedeemBalance: 0, maxRedeemPercent: 100 }),
      ),
    );
    const won = results.filter((r): r is { ok: true; applied: number } => r.ok);
    const totalApplied = won.reduce((s, r) => s + r.applied, 0);
    const after = await getBalance({ restaurantId, customerId });
    console.log(`  winners: ${won.length}  | applied each: [${won.map((r) => r.applied).join(", ")}]`);
    console.log(`  total drawn: $${totalApplied.toFixed(2)}   final balance: $${after.toFixed(2)}`);

    if (totalApplied > start + 0.001) fails.push(`OVER-SPEND: drew $${totalApplied} from a $${start} wallet`);
    if (after < -0.001) fails.push(`NEGATIVE BALANCE: $${after}`);
    if (Math.abs(start - totalApplied - after) > 0.01) fails.push(`LEDGER MISMATCH: ${start} - ${totalApplied} ≠ ${after}`);
    console.log(`  → ${totalApplied <= start && after >= 0 ? "no over-spend, no negative balance ✓" : "✗ SEE FAILURES"}\n`);

    // ── TEST 2: double-complete idempotency (2 concurrent identical grants) ───
    console.log("TEST 2 — 2 concurrent grant($3, order=DBLTEST, reason=earn) [double-complete]:");
    const beforeEarn = await getBalance({ restaurantId, customerId });
    await Promise.all([
      grant({ restaurantId, customerId, amount: 3, reason: "earn", orderId: "concurrency-dbl-test" }),
      grant({ restaurantId, customerId, amount: 3, reason: "earn", orderId: "concurrency-dbl-test" }),
    ]);
    const afterEarn = await getBalance({ restaurantId, customerId });
    const acct = await prisma.rewardAccount.findUnique({ where: { restaurantId_customerId: { restaurantId, customerId } }, select: { id: true } });
    const earnRows = await prisma.rewardLedger.count({ where: { accountId: acct!.id, orderId: "concurrency-dbl-test", reason: "earn" } });
    console.log(`  balance ${beforeEarn.toFixed(2)} → ${afterEarn.toFixed(2)} (expect +3.00 once)   earn rows: ${earnRows} (expect 1)`);
    if (earnRows !== 1) fails.push(`DOUBLE-GRANT: ${earnRows} earn rows for one order (expected 1)`);
    if (Math.abs(afterEarn - beforeEarn - 3) > 0.01) fails.push(`DOUBLE-GRANT balance: rose by ${(afterEarn - beforeEarn).toFixed(2)} (expected 3.00)`);
    console.log(`  → ${earnRows === 1 ? "idempotent — exactly one earn row ✓" : "✗ SEE FAILURES"}\n`);
  } finally {
    // ── Cleanup: remove all test data ─────────────────────────────────────────
    const acct = await prisma.rewardAccount.findUnique({ where: { restaurantId_customerId: { restaurantId, customerId } }, select: { id: true } });
    if (acct) await prisma.rewardLedger.deleteMany({ where: { accountId: acct.id } });
    await prisma.rewardAccount.deleteMany({ where: { restaurantId, customerId } });
    await prisma.customer.delete({ where: { id: customerId } }).catch(() => {});
    console.log("(cleaned up test customer + wallet)");
  }

  console.log(fails.length ? `\n✗ FAIL:\n - ${fails.join("\n - ")}` : `\n✓ PASS — atomic spend + idempotent grant both hold.`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
