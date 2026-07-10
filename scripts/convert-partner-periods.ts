/**
 * ONE-TIME (Luigi 2026-07-10): convert the pre-live-era add-on rows of the
 * three test restaurants into time-boxed FREE PARTNER PERIODS.
 *
 * Their subscriptions were created on the old TEST Stripe account — the live
 * account never bills them and their webhooks can't reach us, so the rows
 * would have stayed "active" (free) forever. Per Luigi:
 *   - luigis-lasagna-pizzeria  → free until now + 7 days
 *   - ristorante-test (Fabrizio) → free until now + 45 days (1.5 months)
 *   - test-latest-june (Milton)  → free until its current billing-cycle end
 *
 * Each ACTIVE row becomes status="trialing" + trialEndsAt=<date> with the
 * dead test-mode subscription pointers cleared. The admin banner
 * (PartnerPeriodBanner) counts down; the expire-addon-trials cron cancels
 * them once the date passes; re-subscribing with a real card creates a fresh
 * live subscription on the same row. Idempotent: already-converted (trialing)
 * or cancelled rows are untouched.
 *
 * Run: npx tsx scripts/run-on-prod.ts scripts/convert-partner-periods.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const DAY = 24 * 60 * 60 * 1000;
const PLAN: Record<string, { endsAt: (rowPeriodEnd: Date | null) => Date; label: string }> = {
  "luigis-lasagna-pizzeria": { endsAt: () => new Date(Date.now() + 7 * DAY), label: "+7 days (Luigi)" },
  "ristorante-test": { endsAt: () => new Date(Date.now() + 45 * DAY), label: "+45 days (Fabrizio, 1.5 months)" },
  "test-latest-june": { endsAt: (pe) => pe ?? new Date(Date.now() + 30 * DAY), label: "current cycle end (Milton)" },
};

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  for (const [slug, plan] of Object.entries(PLAN)) {
    const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!r) { console.log(`SKIP ${slug}: restaurant not found`); continue; }

    const rows = await prisma.restaurantAddOn.findMany({
      where: { restaurantId: r.id, status: "active" },
      select: { id: true, currentPeriodEnd: true, stripeSubscriptionId: true, addOn: { select: { slug: true } } },
    });
    if (rows.length === 0) { console.log(`${r.name}: no active add-on rows (already converted?)`); continue; }

    console.log(`\n${r.name} (${slug}) — ${plan.label}:`);
    for (const row of rows) {
      const endsAt = plan.endsAt(row.currentPeriodEnd);
      await prisma.restaurantAddOn.update({
        where: { id: row.id },
        data: {
          status: "trialing",
          trialEndsAt: endsAt,
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          graceEndsAt: null,
        },
      });
      console.log(`  ${row.addOn.slug}: active${row.stripeSubscriptionId ? ` (test sub ${row.stripeSubscriptionId.slice(0, 7)}…)` : " (comped)"} → trialing until ${endsAt.toISOString().slice(0, 10)}`);
    }
  }
  console.log("\nDone. Verify with scripts/_audit-addon-entitlements.ts");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
