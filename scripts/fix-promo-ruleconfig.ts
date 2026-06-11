/**
 * Repair promos whose `ruleConfig` (Json — the column the engine prefers) lost
 * its group targeting (categoryIds / itemIds / variantIds emptied) while the
 * legacy `rules` string kept it. Restores per-group targeting from the rules
 * string, matched by group `id`. Surgical: only touches groups that are empty
 * in ruleConfig but populated in rules; ruleConfig-only promos (no rules
 * string) are left untouched. Luigi 2026-06-11.
 *
 *   DRY RUN (default):  npx tsx scripts/run-on-prod.ts scripts/fix-promo-ruleconfig.ts
 *   APPLY:              npx tsx scripts/run-on-prod.ts scripts/fix-promo-ruleconfig.ts --apply
 *   (omit run-on-prod to target the active/dev DB)
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

type Group = { id?: string; categoryIds?: string[]; itemIds?: string[]; variantIds?: string[] } & Record<string, unknown>;
const isEmpty = (g: Group) =>
  !(g.categoryIds?.length) && !(g.itemIds?.length) && !(g.variantIds?.length);
const hasTargeting = (g: Group) =>
  !!(g.categoryIds?.length || g.itemIds?.length || g.variantIds?.length);

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  const promos = await prisma.promotion.findMany({
    select: { id: true, name: true, rules: true, ruleConfig: true },
  });

  let fixed = 0;
  for (const p of promos) {
    if (!p.ruleConfig || typeof p.ruleConfig !== "object" || Array.isArray(p.ruleConfig)) continue;
    let rulesObj: any;
    try { rulesObj = JSON.parse(p.rules || "{}"); } catch { continue; }
    const rulesGroups: Group[] = Array.isArray(rulesObj?.groups) ? rulesObj.groups : [];
    if (!rulesGroups.length) continue;

    const rc: any = JSON.parse(JSON.stringify(p.ruleConfig));
    const rcGroups: Group[] = Array.isArray(rc.groups) ? rc.groups : [];
    if (!rcGroups.length) continue;

    let changed = false;
    for (const g of rcGroups) {
      if (!isEmpty(g)) continue;
      // Find the matching rules group: by id, else positional fallback.
      const src =
        rulesGroups.find((rg) => rg.id && rg.id === g.id) ??
        (rcGroups.length === rulesGroups.length ? rulesGroups[rcGroups.indexOf(g)] : undefined);
      if (src && hasTargeting(src)) {
        g.categoryIds = src.categoryIds ?? [];
        g.itemIds = src.itemIds ?? [];
        g.variantIds = src.variantIds ?? [];
        changed = true;
      }
    }

    if (changed) {
      fixed++;
      console.log(`FIX "${p.name}" (${p.id})`);
      console.log(`   before: ${JSON.stringify((p.ruleConfig as any).groups)}`);
      console.log(`   after:  ${JSON.stringify(rc.groups)}\n`);
      if (APPLY) {
        await prisma.promotion.update({ where: { id: p.id }, data: { ruleConfig: rc } });
      }
    }
  }

  console.log(`${APPLY ? "Repaired" : "Would repair"} ${fixed} promo(s).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
