/**
 * One-time backfill: seed EmailSuppression from existing opt-outs so the new
 * unified do-not-email gate honours everyone who already unsubscribed BEFORE
 * the suppression table existed (2026-08-04 CASL work).
 *
 * Sources (conservative — only people who explicitly opted OUT, never the
 * default-false "never engaged" majority):
 *   - Customer  where marketingConsent = false AND marketingConsentAt IS NOT NULL
 *               (marketingConsentAt is only set on an explicit opt-in/opt-out;
 *                false + a timestamp == actively unsubscribed)
 *   - Prospect  where unsubscribedAt IS NOT NULL  (restaurantId via its import)
 *
 * Idempotent (upsert), keyset-paginated (no unbounded findMany). Run on each
 * branch:  npx tsx scripts/backfill-suppressions.ts
 *          npx tsx scripts/run-on-prod.ts scripts/backfill-suppressions.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const BATCH = 500;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  async function upsert(restaurantId: string, email: string | null | undefined): Promise<boolean> {
    const emailLower = email?.trim().toLowerCase();
    if (!emailLower || !restaurantId) return false;
    await prisma.emailSuppression.upsert({
      where: { restaurantId_emailLower: { restaurantId, emailLower } },
      create: { restaurantId, emailLower, reason: "unsubscribe", source: "backfill" },
      update: {}, // leave existing rows as-is
    });
    return true;
  }

  // 1. Unsubscribed customers
  let custCount = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows: { id: string; restaurantId: string; email: string | null }[] =
      await prisma.customer.findMany({
        where: { marketingConsent: false, marketingConsentAt: { not: null } },
        select: { id: true, restaurantId: true, email: true },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
    if (rows.length === 0) break;
    for (const r of rows) if (await upsert(r.restaurantId, r.email)) custCount++;
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  // 2. Unsubscribed prospects (restaurantId via import)
  let prospCount = 0;
  cursor = undefined;
  for (;;) {
    const rows: { id: string; email: string; import: { restaurantId: string } | null }[] =
      await prisma.prospect.findMany({
        where: { unsubscribedAt: { not: null } },
        select: { id: true, email: true, import: { select: { restaurantId: true } } },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
    if (rows.length === 0) break;
    for (const r of rows) if (r.import && (await upsert(r.import.restaurantId, r.email))) prospCount++;
    cursor = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }

  console.log(`Backfill complete: ${custCount} customer opt-outs, ${prospCount} prospect opt-outs suppressed.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
