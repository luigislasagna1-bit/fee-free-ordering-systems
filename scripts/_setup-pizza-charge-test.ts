/** DEV-only fixture for the server topping-charge e2e.
 *    setup   — set demo BYO Pizza to extraToppingPrice=10, includedToppings=0
 *              (original config saved to scratch); print ids for the POST.
 *    verify  — print the most recent demo order's items + modifier prices.
 *    restore — write the original pizzaConfig back + delete ZZ test orders.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const SCRATCH = "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c92f4885-c42a-433c-9d2c-1d6e40cf44f6/scratchpad/byo-pizza-config-backup.json";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const mode = process.argv[2];
  const rest = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  const item: any = await prisma.menuItem.findFirst({
    where: { restaurantId: rest!.id, name: { startsWith: "BYO Pizza" } },
    select: { id: true, name: true, pizzaConfig: true, variants: { select: { id: true, name: true, price: true }, orderBy: { sortOrder: "asc" } },
      modifierGroups: { select: { id: true, name: true, libraryGroupId: true, options: { select: { id: true, name: true, priceAdjustment: true }, take: 4 } } } },
  });
  if (!item?.pizzaConfig) throw new Error("BYO Pizza with pizzaConfig not found");

  if (mode === "setup") {
    writeFileSync(SCRATCH, item.pizzaConfig, "utf8");
    const c = JSON.parse(item.pizzaConfig);
    c.extraToppingPrice = 10;
    c.includedToppings = 0;
    delete c.variantToppingPrices;
    await prisma.menuItem.update({ where: { id: item.id }, data: { pizzaConfig: JSON.stringify(c) } });
    const toppingKeys = new Set((c.toppingGroupIds ?? []).map(String));
    const toppingGroup = item.modifierGroups.find((g: any) => toppingKeys.has(g.id) || (g.libraryGroupId && toppingKeys.has(g.libraryGroupId)));
    const otherGroup = item.modifierGroups.find((g: any) => g !== toppingGroup && g.options.some((o: any) => o.priceAdjustment > 0))
      ?? item.modifierGroups.find((g: any) => g !== toppingGroup);
    console.log(JSON.stringify({
      itemId: item.id,
      variantId: item.variants[0]?.id ?? null,
      toppingGroup: toppingGroup ? { name: toppingGroup.name, options: toppingGroup.options } : null,
      otherGroup: otherGroup ? { name: otherGroup.name, options: otherGroup.options.slice(0, 2) } : null,
    }, null, 1));
  } else if (mode === "verify") {
    const order: any = await prisma.order.findFirst({
      where: { restaurantId: rest!.id, customerName: "ZZ Charge Test" },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true, total: true, subtotal: true, items: { select: { name: true, price: true, modifiers: true } } },
    });
    if (!order) { console.log("no test order found"); return; }
    for (const it of order.items) {
      let mods: any[] = [];
      try { mods = typeof it.modifiers === "string" ? JSON.parse(it.modifiers) : (it.modifiers as any[]) ?? []; } catch { /* */ }
      console.log(`ORDER ${order.orderNumber} subtotal=$${order.subtotal} item="${it.name}" unit=$${it.price}`);
      for (const m of mods) console.log(`   ${m.name} = $${m.priceAdjustment}`);
    }
  } else if (mode === "restore") {
    if (existsSync(SCRATCH)) {
      await prisma.menuItem.update({ where: { id: item.id }, data: { pizzaConfig: readFileSync(SCRATCH, "utf8") } });
    }
    const orders = await prisma.order.findMany({ where: { restaurantId: rest!.id, customerName: "ZZ Charge Test" }, select: { id: true } });
    for (const o of orders) {
      await prisma.orderItem.deleteMany({ where: { orderId: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
    console.log(`✅ restored config + removed ${orders.length} test order(s)`);
  } else {
    throw new Error("mode = setup | verify | restore");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
