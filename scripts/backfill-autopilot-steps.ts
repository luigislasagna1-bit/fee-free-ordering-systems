/**
 * Backfill AutopilotStep rows for the new drip-sequence feature (Luigi 2026-06-10).
 *
 * For every restaurant that already has an AutopilotCampaign row:
 *   - reengagement → seed a 5-step win-back ladder (delays 7/14/21/28/35 days,
 *     % 10/15/15/20/20 — matching REENGAGE_TIERS / WIN1..5). Step 1 inherits the
 *     restaurant's existing custom subject/body if they set one; steps 2..5 get
 *     escalating default copy the owner can edit.
 *   - second_order → seed ONE step (delay = existing delayHours, 15% = 2NDOFF),
 *     inheriting the existing subject/body.
 *   - cart_abandonment → SKIPPED (keeps its own CartSession sweep; not stepped).
 *
 * Idempotent: only creates a (restaurantId, campaignType, stepNumber) that does
 * not already exist — safe to re-run. Existing send rows are untouched (they
 * default to sequence 0; stepped sends use 1..N — no collision).
 *
 * Runs against BOTH Neon branches found in .env.local (active + commented),
 * mirroring scripts/migrate-firstbuy-to-master.ts.
 *
 *   npx tsx scripts/backfill-autopilot-steps.ts            # dry-run (report only)
 *   npx tsx scripts/backfill-autopilot-steps.ts --apply    # write
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

type StepSeed = {
  stepNumber: number;
  delayHours: number;
  discountPercent: number;
  subject: string;
  emailBody: string;
};

// 5-tier re-engagement ladder. %s mirror REENGAGE_TIERS (WIN1..5) so the steps
// and the existing campaignSequence Promotion rows already agree.
const REENGAGE_STEPS: StepSeed[] = [
  { stepNumber: 1, delayHours: 7 * 24, discountPercent: 10,
    subject: "We miss you at {restaurant_name}!",
    emailBody: "Hi {customer_name},\n\nIt's been a little while since your last order and we'd love to see you again. Here's a welcome-back treat:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 2, delayHours: 14 * 24, discountPercent: 15,
    subject: "Still thinking of you — here's a little more off",
    emailBody: "Hi {customer_name},\n\nWe bumped up your offer — come back and enjoy something delicious on us:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 3, delayHours: 21 * 24, discountPercent: 15,
    subject: "Your table's waiting — 15% off",
    emailBody: "Hi {customer_name},\n\nA fresh batch is always better with you here. Your offer's still good:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 4, delayHours: 28 * 24, discountPercent: 20,
    subject: "We'd really love you back — 20% off",
    emailBody: "Hi {customer_name},\n\nHere's our best offer yet — come treat yourself:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 5, delayHours: 35 * 24, discountPercent: 20,
    subject: "One last one, just for you — 20% off",
    emailBody: "Hi {customer_name},\n\nWe don't want to lose you. Here's 20% off, no strings:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
];

function readDatabaseUrls(): string[] {
  const content = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}

async function backfillOne(url: string) {
  const masked = url.replace(/:[^:@]+@/, ":***@");
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  let created = 0;
  let skipped = 0;
  try {
    const campaigns = await prisma.autopilotCampaign.findMany({
      where: { campaignType: { in: ["reengagement", "second_order"] } },
      select: { restaurantId: true, campaignType: true, subject: true, emailBody: true, delayHours: true },
    });

    for (const c of campaigns) {
      const seeds: StepSeed[] =
        c.campaignType === "reengagement"
          ? REENGAGE_STEPS.map((s) =>
              s.stepNumber === 1
                ? { ...s, subject: c.subject?.trim() || s.subject, emailBody: c.emailBody?.trim() || s.emailBody, delayHours: c.delayHours || s.delayHours }
                : s,
            )
          : [
              // second_order — single step (2NDOFF = 15%)
              {
                stepNumber: 1,
                delayHours: c.delayHours || 24,
                discountPercent: 15,
                subject: c.subject?.trim() || "Thanks for your order — here's 15% off the next one",
                emailBody: c.emailBody?.trim() || "Hi {customer_name},\n\nThanks for ordering from {restaurant_name}! Here's a little something for next time:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}",
              },
            ];

      for (const s of seeds) {
        const exists = await prisma.autopilotStep.findUnique({
          where: { restaurantId_campaignType_stepNumber: { restaurantId: c.restaurantId, campaignType: c.campaignType, stepNumber: s.stepNumber } },
        });
        if (exists) { skipped++; continue; }
        if (APPLY) {
          await prisma.autopilotStep.create({
            data: { restaurantId: c.restaurantId, campaignType: c.campaignType, ...s, isEnabled: true },
          });
        }
        created++;
      }
    }
    console.log(`  ${APPLY ? "✅ wrote" : "🔎 would create"} ${created} step(s), skipped ${skipped} existing — ${masked}`);
  } catch (e) {
    console.error(`  ❌ ${masked} —`, e instanceof Error ? e.message : e);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const urls = readDatabaseUrls();
  if (urls.length === 0) { console.error("No DATABASE_URL lines found in .env.local"); process.exit(1); }
  console.log(`${APPLY ? "APPLYING" : "DRY-RUN"} autopilot-step backfill on ${urls.length} database(s):`);
  for (const url of urls) await backfillOne(url);
  console.log(APPLY ? "Done." : "Dry-run complete. Re-run with --apply to write.");
}

main().catch((e) => { console.error(e); process.exit(1); });
