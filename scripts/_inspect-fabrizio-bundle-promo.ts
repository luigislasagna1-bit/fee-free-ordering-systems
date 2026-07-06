/** Inspect Fabrizio's MENU PRANZO meal_bundle promo: do its group itemIds /
 *  categoryIds exist in his LIVE menu? Root-cause for cmr80t9rk.
 *   npx tsx scripts/run-on-prod.ts scripts/_inspect-fabrizio-bundle-promo.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const promo: any = await prisma.promotion.findFirst({
    where: { name: { contains: "MENU PRANZO", mode: "insensitive" }, promotionType: { in: ["meal_bundle", "meal_bundle_speciality"] } },
    orderBy: { updatedAt: "desc" },
  });
  if (!promo) { console.log("promo not found"); await prisma.$disconnect(); return; }
  console.log("PROMO:", promo.id, promo.name, promo.promotionType, "restaurantId:", promo.restaurantId, "isActive:", promo.isActive);
  let rc: any = promo.ruleConfig;
  if (typeof rc === "string") { try { rc = JSON.parse(rc); } catch {} }
  if (!rc || typeof rc !== "object") { try { rc = JSON.parse(promo.rules ?? "{}"); } catch { rc = {}; } }
  const groups: any[] = Array.isArray(rc?.groups) ? rc.groups : (Array.isArray(rc?.itemGroups) ? rc.itemGroups : []);
  console.log("bundlePrice:", rc?.bundlePrice, "groups:", groups.length);

  // Menus for the restaurant
  const menus = await prisma.menu.findMany({
    where: { restaurantId: promo.restaurantId },
    select: { id: true, name: true, isActive: true } as any,
  }).catch(() => [] as any[]);
  console.log("MENUS:", JSON.stringify(menus));

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const itemIds: string[] = [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])];
    const catIds: string[] = g.categoryIds ?? [];
    console.log(`\nGROUP ${gi + 1}: label=${JSON.stringify(g.label)} min=${g.minCount} max=${g.maxCount} items=${itemIds.length} cats=${catIds.length}`);
    if (itemIds.length) {
      const found = await prisma.menuItem.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, name: true, restaurantId: true, categoryId: true, lineageId: true, category: { select: { menuId: true } } } as any,
      });
      console.log(`  itemIds found in DB: ${found.length}/${itemIds.length}`);
      for (const f of found as any[]) console.log(`   - ${f.name} menuId=${f.category?.menuId} lineageId=${f.lineageId}`);
      const missing = itemIds.filter((id) => !found.some((f: any) => f.id === id));
      if (missing.length) console.log(`  MISSING ids: ${missing.join(", ")}`);
      // Do live-menu items point at these via lineage?
      const lineageHits = await prisma.menuItem.findMany({
        where: { lineageId: { in: itemIds }, id: { notIn: itemIds } },
        select: { id: true, name: true, lineageId: true, category: { select: { menuId: true } } } as any,
      });
      console.log(`  other items whose lineageId ∈ group itemIds: ${lineageHits.length}`);
      for (const f of lineageHits.slice(0, 5) as any[]) console.log(`   ↳ ${f.name} id=${f.id} menuId=${f.category?.menuId} lineage=${f.lineageId}`);
    }
    if (catIds.length) {
      const cats = await prisma.menuCategory.findMany({
        where: { id: { in: catIds } },
        select: { id: true, name: true, menuId: true } as any,
      }).catch(() => [] as any[]);
      console.log(`  categoryIds found: ${cats.length}/${catIds.length} → ${JSON.stringify(cats)}`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
