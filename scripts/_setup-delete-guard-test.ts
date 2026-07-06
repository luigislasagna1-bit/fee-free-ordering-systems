/** DEV-only fixture for the promo delete-guard e2e.
 *    setup    — create "ZZ Guard Test Dish" in demo Pasta + clone the 20%
 *               promo as "ZZ Dead Promo Test" whose groups reference ONLY
 *               that dish. Prints both ids.
 *    setup-cat — create "ZZ Guard Cat" + dish + promo referencing the CATEGORY.
 *    cleanup  — remove all ZZ test rows.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

function retargetGroups(rc: any, itemIds: string[], categoryIds: string[]): any {
  const clone = JSON.parse(JSON.stringify(rc));
  const groups = [
    ...(Array.isArray(clone.groups) ? clone.groups : []),
    ...(Array.isArray(clone.itemGroups) ? clone.itemGroups : []),
    ...["eligibleGroup", "paidGroup", "freeGroup"].map((k) => clone[k]).filter((g) => g && typeof g === "object"),
  ];
  for (const g of groups) {
    if (Array.isArray(g.itemIds)) g.itemIds = itemIds;
    if (Array.isArray(g.menuItemIds)) g.menuItemIds = itemIds;
    if (Array.isArray(g.categoryIds)) g.categoryIds = categoryIds;
  }
  return clone;
}

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const mode = process.argv[2];
  const rest = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });

  if (mode === "setup" || mode === "setup-cat") {
    const template: any = await prisma.promotion.findFirst({
      where: { restaurantId: rest!.id, name: "20% Stepper Test" },
      select: { promotionType: true, ruleConfig: true, stackingRule: true, channel: true, orderType: true, customerType: true, autoApply: true, displayMode: true },
    });
    if (!template?.ruleConfig) throw new Error("template promo not found");

    let itemId: string, catId: string | null = null;
    if (mode === "setup-cat") {
      const cat = await prisma.menuCategory.create({
        data: { restaurantId: rest!.id, name: "ZZ Guard Cat", sortOrder: 999, menuId: (await prisma.menu.findFirst({ where: { restaurantId: rest!.id, isActive: true }, select: { id: true } }))!.id },
        select: { id: true },
      });
      catId = cat.id;
      itemId = (await prisma.menuItem.create({ data: { restaurantId: rest!.id, categoryId: cat.id, name: "ZZ Guard Cat Dish", price: 5, sortOrder: 0 }, select: { id: true } })).id;
    } else {
      const pasta = await prisma.menuCategory.findFirst({ where: { restaurantId: rest!.id, name: "Pasta", menu: { isActive: true } }, select: { id: true } });
      itemId = (await prisma.menuItem.create({ data: { restaurantId: rest!.id, categoryId: pasta!.id, name: "ZZ Guard Test Dish", price: 9, sortOrder: 999 }, select: { id: true } })).id;
    }
    const rc = retargetGroups(template.ruleConfig, mode === "setup-cat" ? [] : [itemId], mode === "setup-cat" && catId ? [catId] : []);
    const promo = await prisma.promotion.create({
      data: {
        restaurantId: rest!.id, name: mode === "setup-cat" ? "ZZ Dead Promo Cat Test" : "ZZ Dead Promo Test",
        description: "guard e2e", promotionType: template.promotionType, isActive: true,
        stackingRule: template.stackingRule, channel: template.channel, orderType: template.orderType,
        customerType: template.customerType, autoApply: template.autoApply, displayMode: template.displayMode,
        ruleConfig: rc,
      },
      select: { id: true },
    });
    console.log(JSON.stringify({ itemId, catId, promoId: promo.id }));
  } else if (mode === "cleanup") {
    await prisma.promotion.deleteMany({ where: { restaurantId: rest!.id, name: { startsWith: "ZZ Dead Promo" } } });
    const cats = await prisma.menuCategory.findMany({ where: { restaurantId: rest!.id, name: "ZZ Guard Cat" }, select: { id: true } });
    await prisma.menuItem.deleteMany({ where: { OR: [{ name: { startsWith: "ZZ Guard" } }, { categoryId: { in: cats.map((c) => c.id) } }] } });
    await prisma.menuCategory.deleteMany({ where: { id: { in: cats.map((c) => c.id) } } });
    console.log("✅ cleaned up");
  } else {
    throw new Error("mode = setup | setup-cat | cleanup");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
