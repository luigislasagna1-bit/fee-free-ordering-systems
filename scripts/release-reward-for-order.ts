/**
 * One-off recovery: return Reward Dollars that were spent on an order which was
 * auto-rejected/abandoned BEFORE the release fix (2026-06-29) landed — those
 * orders are already "rejected", so the patched auto-reject cron will never
 * re-process them and the credit is stranded in status="applied".
 *
 * Calls the CANONICAL `releaseForOrder` from src/lib/reward-ledger.ts (idempotent:
 * only acts on a still-"applied" spend row, writes a "release" ledger row, and
 * re-credits the wallet). Safe to re-run — a second run no-ops.
 *
 * Usage (prod — Luigi runs this):
 *   npx tsx scripts/run-on-prod.ts scripts/release-reward-for-order.ts <order-id-or-suffix>
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

const idArg = process.argv[2];
if (!idArg) {
  console.error("Usage: ... scripts/release-reward-for-order.ts <order-id-or-suffix>");
  process.exit(1);
}

async function main() {
  // Dynamic imports AFTER dotenv so @/lib/db reads the (prod) DATABASE_URL.
  const prismaMod = await import("@/lib/db");
  const prisma = prismaMod.default;
  const { releaseForOrder } = await import("@/lib/reward-ledger");

  const order = await prisma.order.findFirst({
    where: { id: { contains: idArg } },
    select: { id: true, orderNumber: true, status: true, customerId: true },
  });
  if (!order) { console.error(`No order matching "${idArg}".`); process.exit(1); }

  const spend = await prisma.rewardLedger.findFirst({
    where: { orderId: order.id, reason: "spend" },
    select: { amount: true, status: true, accountId: true },
  });
  if (!spend) { console.log(`Order #${order.orderNumber}: no reward spend row — nothing to release.`); return; }

  const before = await prisma.rewardAccount.findUnique({ where: { id: spend.accountId }, select: { balance: true } });
  console.log(`Order #${order.orderNumber} (status=${order.status})`);
  console.log(`  spend row: $${Math.abs(spend.amount).toFixed(2)}  status=${spend.status}`);
  console.log(`  wallet balance BEFORE: $${(before?.balance ?? 0).toFixed(2)}`);

  if (spend.status !== "applied") {
    console.log(`  spend is already "${spend.status}" — nothing to do (idempotent).`);
    return;
  }

  await releaseForOrder(order.id);

  const after = await prisma.rewardAccount.findUnique({ where: { id: spend.accountId }, select: { balance: true } });
  console.log(`  wallet balance AFTER : $${(after?.balance ?? 0).toFixed(2)}  ✓ released`);
}

main().catch((e) => { console.error(e); process.exit(1); });
