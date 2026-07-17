/**
 * v1.1 Phase 2 backfill — DeliveryAssignment.completedAt for pre-existing
 * terminal rows (delivered | failed | returned | cancelled):
 *
 *   completedAt = COALESCE(deliveredAt, failedAt, returnedAt)
 *
 * (cancelled rows carry failedAt — see the dead-order bail branch in
 * POST /api/driver/assignments/[id]/status — so COALESCE covers them.)
 *
 * Set-based (one raw UPDATE) and idempotent: only rows where completedAt IS
 * NULL are touched, and re-runs are no-ops. Terminal rows with ALL THREE
 * source timestamps null are left alone and WARNED about (never fails).
 *
 * DEPLOY ORDER (plan §5.3): schema push (both branches) → terminal stamps live
 * → THIS backfill (both branches) → reading code. Do not run before the
 * completedAt column exists on the target database.
 *
 * Run:
 *   dev : npx tsx scripts/backfill-assignment-completed-at.ts
 *   prod: npx tsx scripts/run-on-prod.ts scripts/backfill-assignment-completed-at.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const TERMINAL = ["delivered", "failed", "returned", "cancelled"];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);

  const terminalTotal = await p.deliveryAssignment.count({ where: { status: { in: TERMINAL } } });
  const missingBefore = await p.deliveryAssignment.count({
    where: { status: { in: TERMINAL }, completedAt: null },
  });
  console.log(`Terminal assignments: ${terminalTotal} total, ${missingBefore} missing completedAt (before)`);

  const updated = await p.$executeRaw`
    UPDATE "DeliveryAssignment"
    SET "completedAt" = COALESCE("deliveredAt", "failedAt", "returnedAt")
    WHERE "status" IN ('delivered', 'failed', 'returned', 'cancelled')
      AND "completedAt" IS NULL
      AND COALESCE("deliveredAt", "failedAt", "returnedAt") IS NOT NULL
  `;
  console.log(`Backfilled ${updated} row(s).`);

  const missingAfter = await p.deliveryAssignment.count({
    where: { status: { in: TERMINAL }, completedAt: null },
  });
  console.log(`Terminal assignments missing completedAt (after): ${missingAfter}`);

  if (missingAfter > 0) {
    // Terminal rows with deliveredAt, failedAt AND returnedAt all null — no
    // honest completion time exists. Warn, don't fail: these rows simply stay
    // out of the completedAt-keyset history lists (readers guard `not: null`).
    const orphans = await p.deliveryAssignment.findMany({
      where: {
        status: { in: TERMINAL },
        completedAt: null,
        deliveredAt: null,
        failedAt: null,
        returnedAt: null,
      },
      select: { id: true, status: true, restaurantId: true, createdAt: true },
      take: 50,
    });
    console.warn(
      `WARNING: ${missingAfter} terminal row(s) have deliveredAt/failedAt/returnedAt all null — left unstamped (they stay out of history lists). First ${orphans.length}:`,
    );
    for (const o of orphans) {
      console.warn(`  id=${o.id}  status=${o.status}  restaurantId=${o.restaurantId}  createdAt=${o.createdAt.toISOString()}`);
    }
  }
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
