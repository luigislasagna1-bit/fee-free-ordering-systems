/**
 * Clear the free-item "extra charges" basis from PERCENTAGE promotions.
 *
 * Why (Luigi 2026-08-09): the promo wizard renders one shared dropdown for both
 * free-item deals and percentage deals, worded entirely for free items —
 * "Charges on the FREE item", "the whole free item is free". A percentage promo
 * has no free item, so an owner setting up "20% OFF Menu Wide" had no way to
 * know that picking "…& Sizes" makes the engine compute the percentage against
 * `baseNoSize`, i.e. the CHEAPEST variant.
 *
 * Effect on a real customer: a VIP member ordering 40 wings received $3.40 —
 * 20% of the $17 small pack — and the discount would have been $3.40 whatever
 * size he chose.
 *
 * The engine behaviour is intentional and covered by
 * promo-bogo-extra-charges.test.ts, so it is NOT changed. This script only
 * corrects promotions whose configuration is a mistake, restoring the plain
 * meaning of "X% off". The wizard now labels these options in percentage terms
 * and warns on the size option, so it cannot be picked blind again.
 *
 * Only touches promotionType containing "percentage". Free-item promos
 * (bogo / buy_n_get_free / free_item / free_dish_meal) are never touched.
 *
 *   DRY RUN:  npx tsx scripts/run-on-prod.ts scripts/fix-percentage-promo-basis.ts
 *   APPLY:    npx tsx scripts/run-on-prod.ts scripts/fix-percentage-promo-basis.ts --apply
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

  const promos = await prisma.promotion.findMany({
    select: {
      id: true, name: true, promotionType: true, isActive: true, ruleConfig: true,
      restaurant: { select: { name: true } },
    },
  });

  let changed = 0;
  for (const p of promos) {
    if (!(p.promotionType ?? "").includes("percentage")) continue;
    const rc = p.ruleConfig as Record<string, unknown> | null;
    if (!rc || typeof rc !== "object") continue;
    const mode = rc.freeItemExtraChargeMode;
    if (mode !== "addons" && mode !== "addons_sizes") continue;

    changed++;
    const pct = rc.discountPercent;
    console.log(
      `  ${(p.restaurant?.name ?? "?").slice(0, 26).padEnd(28)} ${(p.name ?? "").slice(0, 34).padEnd(36)} ` +
        `${pct}%  ${String(mode)} -> none${p.isActive ? "" : "  (inactive)"}`,
    );

    if (APPLY) {
      // Remove the key entirely rather than writing "none" — normalizeFreeBasis
      // treats absent and "none" identically, and a missing key is the honest
      // representation of "this setting does not apply to a percentage promo".
      const next = { ...rc };
      delete next.freeItemExtraChargeMode;
      await prisma.promotion.update({ where: { id: p.id }, data: { ruleConfig: next as never } });
    }
  }

  console.log(
    changed === 0
      ? "\nNothing to correct."
      : APPLY
        ? `\n✅ Corrected ${changed} percentage promotion(s). "X% off" now applies to the whole eligible line again.`
        : `\n${changed} percentage promotion(s) would be corrected. Re-run with --apply.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
