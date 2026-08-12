/**
 * Re-activate the Autopilot coupon rows a promo cleanup switched off.
 *
 * Why this exists (Luigi 2026-08-11, from Ben Bilton's WIN1 report):
 * WIN1..WIN5 / 2NDOFF / CARTBACK are ordinary `Promotion` rows created and owned
 * by an Autopilot campaign, and they list next to hand-made promos behind the
 * same power button. On 2026-07-03 a routine "retire my old promos" pass at
 * 23:56 UTC switched off fifteen rows in thirty seconds — eight the owner meant
 * to retire, and six that were the LIVE codes of campaigns still running. The
 * drip then emailed those dead codes to 52 customers over five weeks (0
 * redemptions) because `getStepPromos` didn't filter on `isActive`.
 *
 * Both holes are now closed in code (the sender filters, and the PATCH route
 * refuses to deactivate a code an enabled campaign still owns). This script
 * repairs the DATA that was already broken.
 *
 * SAFE BY CONSTRUCTION: it only ever turns a row ON, only for campaigns that are
 * currently ENABLED for that restaurant, and only for rows whose `campaignRef`
 * marks them as campaign-owned. It touches nothing else. Pass --apply to write;
 * without it, it prints the plan and exits.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_reactivate-autopilot-codes.ts <slug>
 *   npx tsx scripts/run-on-prod.ts scripts/_reactivate-autopilot-codes.ts <slug> --apply
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
if (!slug) {
  console.error("Usage: ... _reactivate-autopilot-codes.ts <restaurant-slug> [--apply]");
  process.exit(1);
}

/** Which AutopilotState toggle governs a campaignRef. Mirrors
 *  `toggleKeyForRef` in src/lib/autopilot-promos.ts — kept local so the script
 *  runs standalone against any branch. */
function toggleKeyForRef(ref: string): "reEngageEnabled" | "secondOrderEnabled" | "cartAbandonmentEnabled" | null {
  if (/^autopilot_reengage_win[1-5]$/.test(ref)) return "reEngageEnabled";
  if (ref === "autopilot_2nd_order") return "secondOrderEnabled";
  if (ref === "autopilot_cart_recovery") return "cartAbandonmentEnabled";
  return null;
}

async function main() {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!restaurant) { console.error(`No restaurant "${slug}".`); process.exit(1); }

  const state = await prisma.autopilotState.findUnique({
    where: { restaurantId: restaurant.id },
    select: {
      masterEnabled: true, reEngageEnabled: true,
      secondOrderEnabled: true, cartAbandonmentEnabled: true,
    },
  });

  console.log(`\n=== ${restaurant.name} — Autopilot campaign codes ===`);
  if (!state) { console.log("  No AutopilotState row — Autopilot was never enabled. Nothing to do."); return; }
  console.log(`  master=${state.masterEnabled}  reEngage=${state.reEngageEnabled}  secondOrder=${state.secondOrderEnabled}  cartAbandon=${state.cartAbandonmentEnabled}`);
  if (!state.masterEnabled) { console.log("  Master switch is OFF — codes are correctly dormant. Nothing to do."); return; }

  const promos = await prisma.promotion.findMany({
    where: { restaurantId: restaurant.id, campaignRef: { startsWith: "autopilot_" } },
    select: {
      id: true, name: true, couponCode: true, campaignRef: true,
      isActive: true, endsAt: true, ruleConfig: true,
    },
    orderBy: { campaignRef: "asc" },
  });
  if (!promos.length) { console.log("  This store has no Autopilot-owned promo rows."); return; }

  const now = new Date();
  const toFix: { id: string; label: string; clearEndsAt: boolean }[] = [];

  console.log("");
  for (const p of promos) {
    const key = toggleKeyForRef(p.campaignRef!);
    const campaignOn = key ? state[key] : false;
    const rc = p.ruleConfig as { discountPercent?: unknown } | null;
    const pct = typeof rc?.discountPercent === "number" ? rc.discountPercent : null;
    const expired = !!p.endsAt && p.endsAt < now;
    const label = `${p.couponCode ?? "(no code)"} ${pct != null ? `${pct}%` : ""}`.trim();

    let verdict: string;
    if (!campaignOn) {
      verdict = p.isActive ? "campaign OFF, code on (grace window — leave)" : "campaign OFF — correctly dormant";
    } else if (p.isActive && !expired) {
      verdict = "OK — live";
    } else {
      // Campaign is running but the code can't be redeemed: the exact state the
      // drip was silently shipping. Clear a stale endsAt too, otherwise turning
      // isActive on leaves it expired and the fix does nothing.
      verdict = p.isActive ? "EXPIRED while campaign runs → REACTIVATE" : "OFF while campaign runs → REACTIVATE";
      toFix.push({ id: p.id, label, clearEndsAt: expired });
    }
    console.log(`  ${label.padEnd(14)} ${(p.campaignRef ?? "").padEnd(26)} active=${String(p.isActive).padEnd(5)} endsAt=${p.endsAt ? p.endsAt.toISOString().slice(0, 10) : "-".padEnd(10)}  ${verdict}`);
  }

  if (!toFix.length) { console.log("\n  Nothing to repair — every running campaign has a redeemable code.\n"); return; }

  console.log(`\n  ${toFix.length} code(s) to reactivate: ${toFix.map((f) => f.label).join(", ")}`);
  if (!apply) { console.log("  DRY RUN — re-run with --apply to write.\n"); return; }

  for (const f of toFix) {
    await prisma.promotion.update({
      where: { id: f.id },
      data: { isActive: true, ...(f.clearEndsAt ? { endsAt: null } : {}) },
    });
    console.log(`  ✔ reactivated ${f.label}`);
  }
  console.log("\n  Done.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
