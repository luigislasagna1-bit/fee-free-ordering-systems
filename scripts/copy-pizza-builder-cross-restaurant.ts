/**
 * CROSS-RESTAURANT pizza-builder copy (2026-06-30). Clones the full pizza-builder
 * config (crust/sauce/cheese/toppings modifier groups + options + pizzaConfig +
 * pizzaRole + supportsHalfHalf) from a SOURCE pizza in one store onto TARGET
 * pizza items in ANOTHER store, so the targets get the real builder incl. HALF/HALF.
 *
 * The in-app "Copy settings" feature is SAME-restaurant only. This mirrors its
 * logic but: (1) rewrites restaurantId on every cloned row to the target store;
 * (2) copies pizzaRole (the app endpoint omits it — latent bug); (3) sets cloned
 * libraryGroupId=null (the source's library refs don't exist in the target store);
 * (4) remaps pizzaConfig group refs by BOTH old group.id AND old libraryGroupId →
 * new group.id, so it works whichever id-style pizzaConfig used.
 *
 * Item name/description/price/image/category are NOT touched — only the builder.
 * Each target runs in its own transaction; re-running is safe (it deletes the
 * target's item-level groups first, then re-clones).
 *
 * Usage (Luigi runs on prod):
 *   npx tsx scripts/run-on-prod.ts scripts/copy-pizza-builder-cross-restaurant.ts \
 *     <sourceSlug> <sourceItemId> <targetSlug> [targetItemId,targetItemId,...]
 * If target ids are omitted, every item in the target store whose CATEGORY name
 * contains "pizza" is used.  --dry to preview without writing.
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaNeon } from "@prisma/adapter-neon";
const cs = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: /\.neon\.tech([:/?]|$)/i.test(cs) ? new PrismaNeon({ connectionString: cs }) : new PrismaPg({ connectionString: cs }) } as any);

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const [sourceSlug, sourceItemId, targetSlug, targetIdsCsv] = args.filter((a) => a !== "--dry");

function remapPizzaConfig(raw: string | null, idMap: Map<string, string>): string | null {
  if (!raw) return null;
  let c: any;
  try { c = JSON.parse(raw); } catch { return raw; }
  const swap = (v: any) => (typeof v === "string" && idMap.has(v) ? idMap.get(v)! : v);
  if (c.crustGroupId) c.crustGroupId = swap(c.crustGroupId);
  if (c.sauceGroupId) c.sauceGroupId = swap(c.sauceGroupId);
  if (c.cheeseGroupId) c.cheeseGroupId = swap(c.cheeseGroupId);
  if (Array.isArray(c.toppingGroupIds)) c.toppingGroupIds = c.toppingGroupIds.map(swap);
  if (Array.isArray(c.sectionOrder)) c.sectionOrder = c.sectionOrder.map(swap);
  return JSON.stringify(c);
}

async function main() {
  if (!sourceSlug || !sourceItemId || !targetSlug) {
    console.error("Usage: ... <sourceSlug> <sourceItemId> <targetSlug> [targetIds csv] [--dry]");
    process.exit(1);
  }
  const src = await prisma.restaurant.findUnique({ where: { slug: sourceSlug }, select: { id: true, name: true } });
  const tgt = await prisma.restaurant.findUnique({ where: { slug: targetSlug }, select: { id: true, name: true } });
  if (!src || !tgt) { console.error("Source or target restaurant not found."); process.exit(1); }

  // Source builder pizza + its item-level AND category-level modifier groups.
  const source = await prisma.menuItem.findFirst({
    where: { id: sourceItemId, restaurantId: src.id },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
      modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } },
      category: { select: { modifierGroups: { include: { options: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!source) { console.error(`Source item ${sourceItemId} not in ${sourceSlug}.`); process.exit(1); }
  const sourceGroups = [...source.modifierGroups, ...((source.category?.modifierGroups ?? []) as any[])];
  if (!source.pizzaConfig || sourceGroups.length === 0) {
    console.error("Source item has no pizzaConfig or no modifier groups — not a builder pizza."); process.exit(1);
  }

  // Targets: explicit ids, else every item in a category whose name contains "pizza".
  let targets;
  if (targetIdsCsv) {
    const ids = targetIdsCsv.split(",").map((s) => s.trim()).filter(Boolean);
    targets = await prisma.menuItem.findMany({ where: { id: { in: ids }, restaurantId: tgt.id }, select: { id: true, name: true } });
  } else {
    targets = await prisma.menuItem.findMany({
      where: { restaurantId: tgt.id, category: { is: { name: { contains: "pizza", mode: "insensitive" } } } },
      select: { id: true, name: true },
    });
  }
  targets = targets.filter((t) => t.id !== sourceItemId);
  if (!targets.length) { console.error("No target items resolved."); process.exit(1); }

  console.log(`\nSOURCE: "${source.name}" (${src.name}) — ${sourceGroups.length} groups, pizzaConfig present`);
  console.log(`TARGETS in ${tgt.name}: ${targets.map((t) => `"${t.name}"`).join(", ")}`);
  console.log(dry ? "\n(DRY RUN — no writes)\n" : "\nApplying…\n");

  let ok = 0, failed = 0;
  for (const target of targets) {
    if (dry) { console.log(`  would convert "${target.name}" (${target.id})`); continue; }
    try {
      await prisma.$transaction(async (tx) => {
        await tx.modifierGroup.deleteMany({ where: { menuItemId: target.id } });
        const idMap = new Map<string, string>();
        for (const g of sourceGroups) {
          const ng = await tx.modifierGroup.create({
            data: {
              restaurantId: tgt.id,           // ← TARGET store
              menuItemId: target.id,
              variantId: null,
              libraryGroupId: null,           // ← drop cross-restaurant library ref
              name: g.name, description: g.description,
              required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect,
              maxPerOption: g.maxPerOption, isHidden: g.isHidden, sortOrder: g.sortOrder,
              pizzaRole: g.pizzaRole,         // ← copied (app endpoint omits this)
              supportsHalfHalf: g.supportsHalfHalf,
              options: { create: g.options.map((o: any) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: o.sortOrder })) },
            },
          });
          idMap.set(g.id, ng.id);
          if (g.libraryGroupId) idMap.set(g.libraryGroupId, ng.id); // remap either ref style
        }
        // Variants only if the source has them (keeps the target's own price otherwise).
        if (source.hasVariants && source.variants.length) {
          await tx.itemVariant.deleteMany({ where: { menuItemId: target.id } });
          for (const v of source.variants) {
            await tx.itemVariant.create({ data: { menuItemId: target.id, name: v.name, price: v.price, sortOrder: v.sortOrder, isDefault: v.isDefault } });
          }
        }
        await tx.menuItem.update({
          where: { id: target.id },
          data: { pizzaConfig: remapPizzaConfig(source.pizzaConfig, idMap), ...(source.hasVariants ? { hasVariants: true } : {}) },
        });
      });
      console.log(`  ✓ "${target.name}" — builder copied`);
      ok++;
    } catch (e) {
      console.error(`  ✗ "${target.name}" failed:`, e instanceof Error ? e.message : e);
      failed++;
    }
  }
  console.log(`\nDone. ok=${ok} failed=${failed}.${dry ? " (dry run)" : " Open the demo order page and try half/half on a pizza."}`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
