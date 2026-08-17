/**
 * Day-one backfill for `Promotion.phoneOrders` ("Available by phone (Nabil AI)",
 * Luigi's decision A64(a), 2026-08-17).
 *
 * The column ships with @default(true) — every owner-made promo keeps applying
 * by phone. Until this shipped, the ONLY promos kept off phone orders were the
 * Kickstarter / Autopilot email-campaign promos, by a hardcoded campaignRef rule
 * (`isOnlineOnlyCampaignRef`, Luigi 2026-08-16, ORD-971682861). This script
 * carries that rule into the column — phoneOrders=false exactly where the rule
 * matched — so behaviour is byte-identical on the day the setting ships and the
 * hardcode can go. From then on the owner's per-promo switch is the truth.
 *
 * Idempotent in the DB sense: only rows still at phoneOrders=true are touched,
 * so a second run right after the first changes 0 rows. ⚠️ It is NOT aware of
 * owner intent: run it ONCE per Neon branch, immediately after the schema push
 * and BEFORE any owner flips a campaign promo back on — a later re-run would
 * undo such an edit. (Nothing else in the system calls this.)
 *
 * Run twice — once for each Neon branch — right after scripts/push-schema-to-both.ts:
 *   npx tsx scripts/backfill-promo-phone-orders.ts                       # .env.local active URL (dev branch)
 *   npx tsx scripts/backfill-promo-phone-orders.ts "<prod-url>"          # explicit URL for prod
 *   npx tsx scripts/backfill-promo-phone-orders.ts --dry-run             # counts only, no writes
 *   npx tsx scripts/backfill-promo-phone-orders.ts "<url>" --dry-run
 */
import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  isOnlineOnlyCampaignRef,
  onlineOnlyCampaignRefWhere,
  ONLINE_ONLY_CAMPAIGN_REF_PREFIXES,
} from "../src/lib/assigned-promos";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const explicitUrl = args.find((a) => !a.startsWith("--"));
if (!explicitUrl) {
  dotenvConfig({ path: ".env.local" });
  dotenvConfig({ path: ".env" });
}

async function main() {
  const url = explicitUrl ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("No DATABASE_URL");
    process.exit(1);
  }
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(
    `${dryRun ? "[DRY RUN] " : ""}Backfilling Promotion.phoneOrders against: ${url.replace(/:[^:@]+@/, ":****@")}`,
  );
  console.log(`  rule: campaignRef starts with ${ONLINE_ONLY_CAMPAIGN_REF_PREFIXES.map((p) => `"${p}"`).join(" | ")}  →  phoneOrders = false`);

  // Candidates by the SQL side of the rule (the where-fragment), then
  // re-asserted in code by the predicate itself — the two live together in
  // src/lib/assigned-promos.ts and a test pins them to the same set.
  const candidates = await prisma.promotion.findMany({
    where: onlineOnlyCampaignRefWhere(),
    select: { id: true, restaurantId: true, name: true, campaignRef: true, phoneOrders: true },
    orderBy: [{ restaurantId: "asc" }, { campaignRef: "asc" }],
  });
  const matched = candidates.filter((p) => isOnlineOnlyCampaignRef(p.campaignRef));
  const skippedByPredicate = candidates.length - matched.length;
  if (skippedByPredicate > 0) {
    // Cannot happen while the where-fragment and the predicate agree; loud if it ever does.
    console.warn(`  ⚠ ${skippedByPredicate} row(s) matched the SQL rule but not the predicate — left untouched.`);
  }

  const total = await prisma.promotion.count();
  const alreadyOff = matched.filter((p) => p.phoneOrders === false);
  const toFlip = matched.filter((p) => p.phoneOrders !== false);

  const byPrefix = new Map<string, number>();
  for (const p of matched) {
    const prefix = ONLINE_ONLY_CAMPAIGN_REF_PREFIXES.find((x) => p.campaignRef?.startsWith(x)) ?? "?";
    byPrefix.set(prefix, (byPrefix.get(prefix) ?? 0) + 1);
  }

  console.log(`  promotions total ............ ${total}`);
  console.log(`  campaign promos (rule hits) . ${matched.length}  (${[...byPrefix].map(([k, v]) => `${k}: ${v}`).join(", ") || "none"})`);
  console.log(`  already phoneOrders=false ... ${alreadyOff.length}`);
  console.log(`  to set phoneOrders=false .... ${toFlip.length}`);
  console.log(`  owner-made / assigned (kept true) ${total - matched.length}`);

  if (toFlip.length === 0) {
    console.log("Nothing to change.");
  } else if (dryRun) {
    for (const p of toFlip) console.log(`    would flip  ${p.campaignRef?.padEnd(28)} ${p.name}  (${p.restaurantId})`);
    console.log("[DRY RUN] no rows written.");
  } else {
    // Only rows still at true — a second run changes nothing (idempotent).
    const res = await prisma.promotion.updateMany({
      where: { id: { in: toFlip.map((p) => p.id) }, phoneOrders: true },
      data: { phoneOrders: false },
    });
    for (const p of toFlip) console.log(`    flipped     ${p.campaignRef?.padEnd(28)} ${p.name}  (${p.restaurantId})`);
    console.log(`  ✓ updated ${res.count} row(s).`);
  }

  await prisma.$disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
