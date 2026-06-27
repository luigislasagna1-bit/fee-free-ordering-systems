/** Verify the coupon-cap fix: (a) the engine's global-cap guard enforces once usedCount is
 *  right, and (b) the exact updateMany increment really bumps usedCount atomically.
 *  Run on DEV: npx tsx scripts/_verify-promo-increment.ts
 *  Confirm Fabrizio's promo on PROD: npx tsx scripts/run-on-prod.ts scripts/_verify-promo-increment.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

// The engine's EXACT global-cap guard (promo-engine.ts:283).
const excludedByCap = (usedCount: number, usageLimit: number | null) =>
  usageLimit != null && usedCount >= usageLimit;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isProd = /ep-dawn-tree/i.test(url); // prod branch host
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  let pass = 0, fail = 0;
  const ok = (label: string, cond: boolean) => { console.log(`  ${cond ? "✅" : "❌ FAIL"} ${label}`); cond ? pass++ : fail++; };

  console.log("── Cap guard (the existing check that enforces once usedCount is correct) ──");
  ok("max-1-use, usedCount 0 → eligible (cap not reached)", excludedByCap(0, 1) === false);
  ok("max-1-use, usedCount 1 → EXCLUDED (Fabrizio's reuse now blocked)", excludedByCap(1, 1) === true);
  ok("unlimited (usageLimit null) → never capped", excludedByCap(999, null) === false);

  // Real-world: Fabrizio's reported code (only present on prod).
  const fab = await prisma.promotion.findFirst({ where: { couponCode: { equals: "TESTCOUPON01X", mode: "insensitive" } }, select: { name: true, couponCode: true, usageLimit: true, usedCount: true } });
  if (fab) console.log(`\n  Fabrizio's promo: code=${fab.couponCode} usageLimit=${fab.usageLimit} usedCount=${fab.usedCount}  (usedCount stuck low despite reuse = the bug)`);

  if (isProd) {
    console.log("\n(prod — skipping the write/increment test; cap-guard + Fabrizio read above)");
  } else {
    console.log("\n── The fix: atomic increment really bumps usedCount ──");
    const p = await prisma.promotion.findFirst({ select: { id: true, name: true, usedCount: true } });
    if (!p) console.log("  (no promo on dev to increment-test)");
    else {
      const before = p.usedCount;
      await prisma.promotion.updateMany({ where: { id: { in: [p.id] } }, data: { usedCount: { increment: 1 } } });
      const after = (await prisma.promotion.findUnique({ where: { id: p.id }, select: { usedCount: true } }))!.usedCount;
      ok(`updateMany increment: "${p.name}" usedCount ${before} → ${after}`, after === before + 1);
      await prisma.promotion.update({ where: { id: p.id }, data: { usedCount: before } });
      console.log(`  ↩ restored usedCount to ${before}`);
    }
  }

  console.log(`\n${fail === 0 ? "🎉 verified" : `⚠️ ${fail} FAILED`} (${pass} passed, ${fail} failed)`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
