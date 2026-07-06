/** READ-ONLY: run resolvePromoMenuRefsForServing against Fabrizio's MENU
 *  PRANZO bundle promo on prod and print how each group's refs resolve.
 *   npx tsx scripts/run-on-prod.ts scripts/_verify-lineage-resolver.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { default: prisma } = await import("../src/lib/db");
  const { resolvePromoMenuRefsForServing } = await import("../src/lib/menu");

  const promo: any = await prisma.promotion.findFirst({
    where: { name: "MENU PRANZO", promotionType: "meal_bundle" },
    orderBy: { updatedAt: "desc" },
  });
  if (!promo) { console.log("promo not found"); return; }

  const liveItemIds = new Set(
    (await prisma.menuItem.findMany({
      where: { restaurantId: promo.restaurantId, category: { menu: { isActive: true } } },
      select: { id: true },
    })).map((i) => i.id),
  );

  const [resolved] = await resolvePromoMenuRefsForServing(promo.restaurantId, [promo]);
  let rc: any = (resolved as any).ruleConfig;
  if (typeof rc === "string") rc = JSON.parse(rc);
  const groups: any[] = rc?.groups ?? [];
  for (let i = 0; i < groups.length; i++) {
    const ids: string[] = [...(groups[i].itemIds ?? []), ...(groups[i].menuItemIds ?? [])];
    const live = ids.filter((id) => liveItemIds.has(id));
    console.log(`GROUP ${i + 1}: totalRefs=${ids.length} liveMenuMatches=${live.length} cats=${(groups[i].categoryIds ?? []).length}`);
  }
  // Category check: any resolved category id belong to the ACTIVE menu?
  const catIds: string[] = groups.flatMap((g: any) => g.categoryIds ?? []);
  if (catIds.length) {
    const liveCats = await prisma.menuCategory.findMany({
      where: { id: { in: catIds }, menu: { isActive: true } },
      select: { id: true, name: true },
    });
    console.log(`CATEGORY refs=${catIds.length} on-live-menu=${liveCats.length} (${liveCats.map((c) => c.name).join(", ")})`);
  }
  console.log("VERDICT:", groups.every((g: any, i: number) => {
    const ids: string[] = [...(g.itemIds ?? []), ...(g.menuItemIds ?? [])];
    return ids.some((id) => liveItemIds.has(id));
  }) ? "✅ every group now has live-menu items" : "❌ some group still empty");
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
