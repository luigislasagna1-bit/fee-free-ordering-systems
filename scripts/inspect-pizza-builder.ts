/**
 * READ-ONLY pizza-builder inspector (2026-06-30). Picks the best CROSS-RESTAURANT
 * copy source + shows the target store's current pizza items. Writes nothing.
 *
 * For each store it lists items with a pizzaConfig (builder pizzas), scored by
 * builder completeness (crust/sauce/cheese/topping roles + group/option counts),
 * so we copy from the most complete pizza (e.g. a BYO), not a 1-topping special.
 *
 * Usage:
 *   npx tsx scripts/run-on-prod.ts scripts/inspect-pizza-builder.ts <source-slug> <target-slug>
 *   e.g. ... luigis-lasagna-pizzeria fee-free-demo-restaurant
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaNeon } from "@prisma/adapter-neon";
const cs = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: /\.neon\.tech([:/?]|$)/i.test(cs) ? new PrismaNeon({ connectionString: cs }) : new PrismaPg({ connectionString: cs }) } as any);
const [, , sourceSlug, targetSlug] = process.argv;

function parseCfg(raw: string | null): any { try { return raw ? JSON.parse(raw) : null; } catch { return null; } }

async function listBuilderPizzas(slug: string, label: string) {
  const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!r) { console.log(`\n!! No restaurant "${slug}".`); return null; }
  console.log(`\n=== ${label}: ${r.name} (${slug}) ===`);
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: r.id },
    select: {
      id: true, name: true, price: true, hasVariants: true, pizzaConfig: true,
      _count: { select: { variants: true } },
      modifierGroups: { select: { id: true, name: true, pizzaRole: true, supportsHalfHalf: true, _count: { select: { options: true } } } },
      category: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
  const pizzas = items.filter((i) => parseCfg(i.pizzaConfig)?.isPizza);
  if (!pizzas.length) console.log("  (no items with pizzaConfig.isPizza — no builder pizzas here)");
  // Score builder pizzas by role completeness; show ALL pizzas + a few non-pizza items too.
  const scored = pizzas.map((i) => {
    const c = parseCfg(i.pizzaConfig);
    const roles = new Set(i.modifierGroups.map((g) => g.pizzaRole).filter(Boolean));
    const opts = i.modifierGroups.reduce((s, g) => s + g._count.options, 0);
    return { i, c, roles, groupCount: i.modifierGroups.length, opts, score: roles.size * 100 + i.modifierGroups.length * 5 + opts };
  }).sort((a, b) => b.score - a.score);
  for (const s of scored) {
    console.log(`  • "${s.i.name}"  id=${s.i.id}  $${s.i.price}  [${s.i.category?.name ?? "?"}]  variants=${s.i._count.variants}  hasVariants=${s.i.hasVariants}`);
    console.log(`     pizzaConfig: allowHalfHalf=${s.c?.allowHalfHalf} crust=${!!s.c?.crustGroupId} sauce=${!!s.c?.sauceGroupId} cheese=${!!s.c?.cheeseGroupId} toppingGroups=${(s.c?.toppingGroupIds ?? []).length} included=${s.c?.includedToppings} extra=$${s.c?.extraToppingPrice}`);
    console.log(`     groups (${s.groupCount}, roles=${[...s.roles].join("/") || "none"}, ${s.opts} options): ${s.i.modifierGroups.map((g) => `${g.name}[${g.pizzaRole ?? "-"}${g.supportsHalfHalf ? ",HH" : ""}:${g._count.options}]`).join(", ")}`);
  }
  const best = scored[0];
  if (best && label === "SOURCE") console.log(`\n  >> BEST SOURCE candidate: "${best.i.name}" (id=${best.i.id}) — ${best.roles.size}/4 roles, ${best.groupCount} groups, ${best.opts} options`);

  // For the target store, also show NON-builder pizza-ish items (so we see Margherita/Pepperoni even without pizzaConfig).
  if (label === "TARGET") {
    const nonBuilder = items.filter((i) => !parseCfg(i.pizzaConfig)?.isPizza);
    console.log(`\n  Non-builder items (${nonBuilder.length}) — candidates to convert:`);
    for (const i of nonBuilder) console.log(`    • "${i.name}"  id=${i.id}  $${i.price}  [${i.category?.name ?? "?"}]  groups=${i.modifierGroups.length}  pizzaConfig=${i.pizzaConfig ? "set(non-pizza)" : "null"}`);
  }
  return r.id;
}

async function main() {
  if (!sourceSlug || !targetSlug) { console.error("Usage: ... scripts/inspect-pizza-builder.ts <source-slug> <target-slug>"); process.exit(1); }
  await listBuilderPizzas(sourceSlug, "SOURCE");
  await listBuilderPizzas(targetSlug, "TARGET");
  console.log("");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
