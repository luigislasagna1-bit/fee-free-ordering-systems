/**
 * Backfill AutopilotSend.cycleKey for rows written before the column existed.
 *
 * Context (spam incident, Luigi 2026-08-07): the win-back ladder restarts when a
 * customer re-orders, and the runner implemented that by ignoring sends older
 * than `lastOrderAt`. But the de-dup unique key had no cycle in it, so the
 * restarted step could never be RECORDED — the insert hit a unique violation
 * that was swallowed as "already sent", after the email had gone out. The cron
 * then re-sent the same email every hour, forever. One address got ~50 copies.
 *
 * `cycleKey` puts the lapse cycle INTO the key so a restarted ladder is
 * writable, and the runner now matches prior sends on cycleKey equality — read
 * key and write key are the same value and cannot drift.
 *
 * This backfill reproduces the OLD filter's meaning exactly, so no customer's
 * position in the ladder shifts:
 *
 *   sentAt >  anchor  ->  cycleKey = anchor   (counted as the current cycle,
 *                                              exactly as the old filter did)
 *   sentAt <= anchor  ->  cycleKey = sentAt   (a distinct PAST cycle, which can
 *                                              never equal a future anchor, so
 *                                              it stays ignored — again matching
 *                                              the old filter)
 *
 * where anchor = the customer's `lastOrderAt ?? createdAt`.
 *
 * Safe to re-run (only touches rows where cycleKey IS NULL).
 *
 *   DRY RUN:  npx tsx scripts/run-on-prod.ts scripts/backfill-autopilot-cycle-key.ts
 *   APPLY:    npx tsx scripts/run-on-prod.ts scripts/backfill-autopilot-cycle-key.ts --apply
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  console.log(APPLY ? "MODE: APPLY (will write)\n" : "MODE: DRY RUN (no writes)\n");

  const rows = await prisma.autopilotSend.findMany({
    where: { cycleKey: null },
    select: {
      id: true,
      customerEmail: true,
      sentAt: true,
      sequence: true,
      campaign: { select: { restaurantId: true } },
    },
  });
  console.log(`Rows needing a cycleKey: ${rows.length}`);
  if (rows.length === 0) {
    console.log("Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  // Resolve each (restaurant, email) -> anchor in ONE query, not per row.
  const pairs = new Map<string, { restaurantId: string; email: string }>();
  for (const r of rows) {
    pairs.set(`${r.campaign.restaurantId}|${r.customerEmail}`, {
      restaurantId: r.campaign.restaurantId,
      email: r.customerEmail,
    });
  }
  const customers = await prisma.customer.findMany({
    where: {
      OR: [...pairs.values()].map((p) => ({ restaurantId: p.restaurantId, email: p.email })),
    },
    select: { restaurantId: true, email: true, lastOrderAt: true, createdAt: true },
  });
  const anchorByPair = new Map<string, Date>();
  for (const c of customers) {
    if (!c.email) continue;
    anchorByPair.set(`${c.restaurantId}|${c.email}`, c.lastOrderAt ?? c.createdAt);
  }

  let current = 0;
  let past = 0;
  let orphan = 0;
  let written = 0;

  for (const r of rows) {
    const anchor = anchorByPair.get(`${r.campaign.restaurantId}|${r.customerEmail}`);
    let cycleKey: Date;
    if (!anchor) {
      // The Customer row is gone (erased / deleted). Pin to sentAt: a distinct
      // past cycle that can never be re-sent.
      cycleKey = r.sentAt;
      orphan++;
    } else if (r.sentAt.getTime() > anchor.getTime()) {
      cycleKey = anchor;
      current++;
    } else {
      cycleKey = r.sentAt;
      past++;
    }
    if (APPLY) {
      await prisma.autopilotSend.update({ where: { id: r.id }, data: { cycleKey } });
      written++;
    }
  }

  console.log(`  current cycle (still counts): ${current}`);
  console.log(`  older cycle  (stays ignored): ${past}`);
  console.log(`  orphaned customer row:        ${orphan}`);
  console.log(
    APPLY
      ? `\n✅ Wrote cycleKey on ${written} row(s). No customer's ladder position changed.`
      : `\nDRY RUN — nothing written. Re-run with --apply.`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
