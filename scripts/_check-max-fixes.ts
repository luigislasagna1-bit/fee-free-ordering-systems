// READ-ONLY: verify Max Bilton's two reported slice issues on the ACTIVE menu
// of Luigi's live store (2026-08-01, OWNER-ACTIONS A36). No writes.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  const rest = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true } });
  if (!rest) { console.log("restaurant not found"); return; }
  const menu = await prisma.menu.findFirst({ where: { restaurantId: rest.id, isActive: true }, select: { id: true, name: true } });
  if (!menu) { console.log("no active menu"); return; }
  console.log(`Store: ${rest.name} · active menu: "${menu.name}" (${menu.id})`);

  const items = await prisma.menuItem.findMany({
    where: {
      category: { menuId: menu.id },
      OR: [{ name: { contains: "slice", mode: "insensitive" } }, { name: { contains: "toonie", mode: "insensitive" } }],
    },
    include: {
      variants: { select: { id: true, name: true } },
      modifierGroups: { include: { options: { select: { name: true, priceAdjustment: true, isAvailable: true } } } },
      category: { select: { name: true } },
    },
  });
  console.log(`Slice/Toonie items on the ACTIVE menu: ${items.length}`);
  for (const it of items) {
    console.log(`\nITEM "${it.name}" [category: ${it.category?.name}] — ${it.modifierGroups.length} item-level group(s), ${it.variants.length} variant(s)`);
    for (const g of it.modifierGroups) {
      const forced = g.required || g.minSelect > 0;
      console.log(`  · "${g.name}" ${forced ? "(REQUIRED/min>0)" : "(optional)"} min=${g.minSelect} max=${g.maxSelect} hidden=${g.isHidden}`);
      console.log(`     options: ${g.options.map(o => `${o.name}${o.priceAdjustment ? ` +$${o.priceAdjustment}` : ""}`).join(", ") || "(none)"}`);
    }
    if (it.variants.length) {
      const vGroups = await prisma.modifierGroup.findMany({
        where: { variantId: { in: it.variants.map(v => v.id) } },
        include: { options: { select: { name: true } } },
      });
      for (const g of vGroups) {
        const vName = it.variants.find(v => v.id === g.variantId)?.name;
        const forced = g.required || g.minSelect > 0;
        console.log(`  · [variant "${vName}"] "${g.name}" ${forced ? "(REQUIRED/min>0)" : "(optional)"} min=${g.minSelect} max=${g.maxSelect} hidden=${g.isHidden} options=${g.options.length}`);
      }
    }
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
