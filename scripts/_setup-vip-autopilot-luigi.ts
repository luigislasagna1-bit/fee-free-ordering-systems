/**
 * Configure the new VIP-aware Autopilot controls for ONE restaurant, and (with
 * --retime) fix a win-back ladder that fires too soon.
 *
 * Why (Luigi 2026-08-11, from Ben Bilton's report):
 *  1. Ten of the first sixty-five Autopilot emails on Luigi's store went to VIP
 *     club members who already hold 20-30% standing discounts. `skipAutopilotOffers`
 *     now exists on CustomerGroup but DEFAULTS TO FALSE — deliberately, because a
 *     "customer group" is a generic bucket and a catering-leads list must keep
 *     receiving campaigns. So the flag has to be set for the groups that really
 *     are discount clubs.
 *  2. The step-1 "we miss you" email was configured at a 72-hour delay and landed
 *     a median of 5.1 days after the customer's last order. For a pizza shop that
 *     is not a lapsed customer, it is a regular who skipped one week — and it
 *     discounts people who were coming back anyway.
 *
 * A group is treated as a real CLUB only when it demonstrably carries a perk:
 * a linked member-only special, or a boosted reward earn rate. A group with
 * neither is left alone and reported, so this can never silently mute a
 * mailing list. Pass --apply to write; without it, it prints the plan.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_setup-vip-autopilot-luigi.ts <slug>
 *   npx tsx scripts/run-on-prod.ts scripts/_setup-vip-autopilot-luigi.ts <slug> --apply --retime
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) { console.error("DATABASE_URL is not set."); process.exit(1); }
const isNeon = /\.neon\.tech([:/?]|$)/i.test(connectionString);
const prisma = new PrismaClient({
  adapter: isNeon ? new PrismaNeon({ connectionString }) : new PrismaPg({ connectionString }),
} as any);

const slug = process.argv[2];
const apply = process.argv.includes("--apply");
const retime = process.argv.includes("--retime");
if (!slug) {
  console.error("Usage: ... _setup-vip-autopilot-luigi.ts <restaurant-slug> [--apply] [--retime]");
  process.exit(1);
}

/** Luigi's chosen ladder: three weeks, then escalating. Replaces 3/14/21/28 days. */
const NEW_DELAYS_DAYS = [21, 40, 60, 90];

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!restaurant) { console.error(`No restaurant "${slug}".`); process.exit(1); }
  console.log(`\n=== ${restaurant.name} ===\n`);

  // ── 1. Which groups are real discount clubs? ──────────────────────────────
  const groups = await prisma.customerGroup.findMany({
    where: { restaurantId: restaurant.id },
    select: {
      id: true, name: true, rewardEarnPercent: true, skipAutopilotOffers: true,
      // BOTH link shapes count as a perk. `groupPromotions` is the real one —
      // the CustomerGroupPromotion join table that makes a promo member-only.
      // `promotions` is the older direct Promotion.customerGroupId relation.
      // Counting only the latter reported Luigi's two Milton clubs as having no
      // perks when they each carry a 25-30% member special, which would have
      // left them receiving win-back codes. Caught on the dry run.
      _count: { select: { members: true, promotions: true, groupPromotions: true } },
    },
    orderBy: { name: "asc" },
  });

  console.log("CUSTOMER GROUPS");
  const toTick: { id: string; name: string }[] = [];
  for (const g of groups) {
    const perks: string[] = [];
    const specials = g._count.groupPromotions + g._count.promotions;
    if (specials > 0) perks.push(`${specials} member special(s)`);
    if (g.rewardEarnPercent != null) perks.push(`${g.rewardEarnPercent}% earn rate`);
    const isClub = perks.length > 0;
    let verdict: string;
    if (g.skipAutopilotOffers) verdict = "already ticked";
    else if (!isClub) verdict = "NOT a discount club — left alone (no perk attached)";
    else { verdict = "→ TICK"; toTick.push({ id: g.id, name: g.name }); }
    console.log(`  ${g.name}`);
    console.log(`    members=${g._count.members}  perks=${perks.join(" + ") || "(none)"}  ${verdict}`);
  }

  // ── 2. The win-back ladder's timing ───────────────────────────────────────
  const steps = await prisma.autopilotStep.findMany({
    where: { restaurantId: restaurant.id, campaignType: "reengagement" },
    orderBy: { stepNumber: "asc" },
    select: { id: true, stepNumber: true, delayHours: true, discountPercent: true },
  });
  console.log("\nRE-ENGAGEMENT LADDER");
  const retimes: { id: string; step: number; fromDays: number; toDays: number }[] = [];
  for (const s of steps) {
    const cur = Math.round((s.delayHours / 24) * 10) / 10;
    const want = NEW_DELAYS_DAYS[s.stepNumber - 1];
    const change = want != null && want !== cur;
    console.log(`  step ${s.stepNumber} (${s.discountPercent}% off): ${cur}d${change ? `  →  ${want}d` : "  (unchanged)"}`);
    if (change) retimes.push({ id: s.id, step: s.stepNumber, fromDays: cur, toDays: want! });
  }
  if (!retime && retimes.length) console.log("  (pass --retime to apply these)");

  // ── 3. Write ──────────────────────────────────────────────────────────────
  const willWrite = toTick.length + (retime ? retimes.length : 0);
  if (!willWrite) { console.log("\nNothing to change.\n"); return; }
  if (!apply) { console.log(`\nDRY RUN — ${willWrite} change(s). Re-run with --apply to write.\n`); return; }

  for (const g of toTick) {
    await prisma.customerGroup.update({ where: { id: g.id }, data: { skipAutopilotOffers: true } });
    console.log(`  ✔ ticked "${g.name}"`);
  }
  if (retime) {
    for (const r of retimes) {
      await prisma.autopilotStep.update({ where: { id: r.id }, data: { delayHours: r.toDays * 24 } });
      console.log(`  ✔ step ${r.step}: ${r.fromDays}d → ${r.toDays}d`);
    }
  }

  // What the campaigns will now do with club members (the per-campaign policy
  // lives on AutopilotState and defaults to "no_offer" — email, but no code).
  const state = await prisma.autopilotState.findUnique({
    where: { restaurantId: restaurant.id },
    select: { reEngageVipMode: true, secondOrderVipMode: true, cartAbandonVipMode: true },
  });
  console.log(`\nClub-member policy per campaign (change on the Autopilot page):`);
  console.log(`  win-back        : ${state?.reEngageVipMode ?? "no_offer"}`);
  console.log(`  second order    : ${state?.secondOrderVipMode ?? "no_offer"}`);
  console.log(`  cart abandonment: ${state?.cartAbandonVipMode ?? "no_offer"}`);
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
