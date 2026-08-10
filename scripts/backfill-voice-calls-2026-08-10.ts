/**
 * Backfill VoiceCall rows written before the 2026-08-10 Nabil dashboard build.
 *
 * Legacy shape: `orderId` actually stored the human orderNumber ("ORD-…")
 * because the voice service had no real Order.id at hangup. The dashboard
 * joins revenue on `orderNumber`, so:
 *
 *  Phase 1 — for rows where orderId looks like an order number ("ORD-" prefix):
 *    copy it into `orderNumber` (never overwriting a value already there) and
 *    resolve the REAL Order.id by number + restaurantId into `orderId`.
 *    When no matching Order exists (deleted / test data), orderId is LEFT
 *    AS-IS so no information is destroyed.
 *
 *  Phase 2 — run the AI intelligence pass (summary / sentiment / upsellCents /
 *    costCents) for calls that have a transcript but no summary yet. Uses the
 *    same generateCallIntelligence the live path uses; requires
 *    ANTHROPIC_API_KEY (phase is skipped with a warning when absent).
 *
 * Safe to re-run: phase 1 only touches "ORD-" orderId rows and is a no-op
 * once resolved; phase 2 skips rows that already have a summary.
 *
 *   DRY RUN (prints, writes nothing, no AI calls):
 *     npx tsx scripts/run-on-prod.ts scripts/backfill-voice-calls-2026-08-10.ts --dry-run
 *   APPLY:
 *     npx tsx scripts/run-on-prod.ts scripts/backfill-voice-calls-2026-08-10.ts
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  // Imported AFTER dotenv so src/lib/db sees DATABASE_URL at module init.
  const { default: prisma } = await import("../src/lib/db");
  const { Prisma } = await import("../src/generated/prisma/client");
  const { generateCallIntelligence } = await import("../src/lib/voice/call-intelligence");

  console.log(DRY_RUN ? "MODE: DRY RUN (no writes)\n" : "MODE: APPLY (will write)\n");

  // ── Phase 1: legacy orderId ("ORD-…") → orderNumber + real Order.id ──
  const legacy = await prisma.voiceCall.findMany({
    where: { orderId: { startsWith: "ORD-" } },
    select: { id: true, restaurantId: true, callSid: true, orderId: true, orderNumber: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Phase 1 — legacy orderId rows: ${legacy.length}`);

  let resolved = 0;
  let unresolved = 0;
  for (const row of legacy) {
    const orderNumber = row.orderNumber ?? row.orderId!;
    const order = await prisma.order.findFirst({
      where: { orderNumber, restaurantId: row.restaurantId },
      select: { id: true },
    });
    const data = {
      orderNumber,
      // Leave orderId as-is when no match — the number is still the join key.
      ...(order ? { orderId: order.id } : {}),
    };
    console.log(
      `  ${row.callSid}: orderNumber=${orderNumber} ` +
        (order ? `orderId ${row.orderId} -> ${order.id}` : `no Order match (orderId left as-is)`),
    );
    if (order) resolved++;
    else unresolved++;
    if (!DRY_RUN) {
      await prisma.voiceCall.update({ where: { id: row.id }, data });
    }
  }
  console.log(`  resolved=${resolved} unresolved=${unresolved}\n`);

  // ── Phase 2: intelligence for calls missing a summary ──
  const pending = await prisma.voiceCall.findMany({
    where: { summary: null, transcript: { not: Prisma.AnyNull } },
    select: { id: true, callSid: true },
    orderBy: { startedAt: "asc" },
    take: 200,
  });
  console.log(`Phase 2 — calls needing intelligence: ${pending.length}`);

  if (DRY_RUN) {
    for (const p of pending) console.log(`  would analyze ${p.callSid}`);
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("  ANTHROPIC_API_KEY not set — skipping phase 2.");
  } else {
    let generated = 0;
    let skipped = 0;
    for (const p of pending) {
      const result = await generateCallIntelligence(p.id);
      if (result) {
        generated++;
        console.log(`  ${p.callSid}: sentiment=${result.sentiment} upsellCents=${result.upsellCents}`);
      } else {
        skipped++;
        console.log(`  ${p.callSid}: skipped (too short / failed — see logs above)`);
      }
    }
    console.log(`  generated=${generated} skipped=${skipped}`);
  }

  console.log(DRY_RUN ? "\nDRY RUN — nothing written. Re-run without --dry-run to apply." : "\n✅ Done.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
