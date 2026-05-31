import prisma from "@/lib/db";

type PizzaConfigShape = {
  crustGroupId?: string;
  sauceGroupId?: string;
  cheeseGroupId?: string;
  toppingGroupIds?: string[];
};

function parsePizza(json: string | null | undefined): PizzaConfigShape {
  if (!json) return {};
  try { return JSON.parse(json) as PizzaConfigShape; }
  catch { return {}; }
}

/** Flatten a config into the set of library-group IDs it references. */
function configIdSet(c: PizzaConfigShape): Set<string> {
  const ids: Array<string | undefined> = [
    c.crustGroupId,
    c.sauceGroupId,
    c.cheeseGroupId,
    ...((c.toppingGroupIds ?? []) as Array<string | undefined>),
  ];
  return new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0));
}

/**
 * Syncs the item's modifier-group attachments against its pizzaConfig.
 *
 * The Pizza Builder modal stores library-group IDs by role (crust /
 * sauce / cheese / toppings). The customer-side PizzaBuilder looks
 * those groups up via item.modifierGroups (matching by libraryGroupId),
 * so we need a real attachment row for each referenced group.
 *
 * Behaviour:
 *   1. **Detach** item-level groups whose libraryGroupId appears in the
 *      OLD config but NOT in the new config. This is what fixes the
 *      "I changed the Crust dropdown and the old crust group is still
 *      attached" bug. Detach only touches item-scoped rows we ourselves
 *      created — variant/category-scoped rows are left alone, and any
 *      drag-and-drop attachments outside pizzaConfig stay untouched
 *      because their libraryGroupId is NOT in the old config set.
 *   2. **Skip attach** when the group is ALREADY inherited from the
 *      item's parent category. Without this guard we'd create a green
 *      item-level chip that visually shadows the blue category-inherited
 *      chip and confuses the owner — surfaced by Luigi 2026-05-31 on
 *      Build Your Own Pizza where "Pizza 1 Crust" appears green even
 *      though it's attached at category level.
 *   3. **Idempotent**: skips IDs that already have an attachment at the
 *      item level.
 *
 * The caller must pass the OLD pizzaConfig — read it from the DB BEFORE
 * applying the update.
 */
export async function syncPizzaConfigAttachments(
  itemId: string,
  restaurantId: string,
  newPizzaConfig: string | null | undefined,
  oldPizzaConfig: string | null | undefined,
): Promise<void> {
  const oldConfig = parsePizza(oldPizzaConfig);
  const newConfig = parsePizza(newPizzaConfig);
  const oldIds = configIdSet(oldConfig);
  const newIds = configIdSet(newConfig);

  // ─── Phase 1: detach groups dropped from pizzaConfig ────────────────
  // A group is "dropped" when its library id was in OLD but not in NEW.
  // We only delete item-level attachments here (menuItemId set) where
  // libraryGroupId matches a dropped id. Category-level or variant-
  // level attachments are intentionally untouched — Pizza Builder owns
  // ONLY the item-level scope.
  const droppedIds = [...oldIds].filter((id) => !newIds.has(id));
  if (droppedIds.length > 0) {
    await prisma.modifierGroup.deleteMany({
      where: {
        menuItem: { id: itemId, restaurantId },
        variantId: null, // belt-and-suspenders: don't touch variant-scoped rows
        libraryGroupId: { in: droppedIds },
      },
    });
  }

  // ─── Phase 2: attach groups newly added to pizzaConfig ──────────────
  if (newIds.size === 0) return;

  // Fetch the item's category so we can check what's already inherited.
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, restaurantId },
    select: { categoryId: true },
  });
  if (!item) return;

  const wantedIds = [...newIds];
  const [sources, alreadyOnItem, alreadyOnCategory] = await Promise.all([
    prisma.modifierGroup.findMany({
      where: { id: { in: wantedIds }, restaurantId },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.modifierGroup.findMany({
      where: { menuItemId: itemId, libraryGroupId: { in: wantedIds } },
      select: { libraryGroupId: true },
    }),
    prisma.modifierGroup.findMany({
      where: { categoryId: item.categoryId, libraryGroupId: { in: wantedIds } },
      select: { libraryGroupId: true },
    }),
  ]);

  const itemAlready = new Set(alreadyOnItem.map((g) => g.libraryGroupId));
  const categoryAlready = new Set(alreadyOnCategory.map((g) => g.libraryGroupId));
  // Skip anything attached at item-level (already done) OR at category-
  // level (item inherits it; creating an item-level dupe shadows the
  // inherited chip).
  const toAttach = sources.filter(
    (s) => !itemAlready.has(s.id) && !categoryAlready.has(s.id),
  );
  if (toAttach.length === 0) return;

  const siblingCount = await prisma.modifierGroup.count({ where: { menuItemId: itemId } });

  for (let i = 0; i < toAttach.length; i++) {
    const source = toAttach[i];
    await prisma.modifierGroup.create({
      data: {
        restaurantId: null,
        menuItemId: itemId,
        categoryId: null,
        libraryGroupId: source.id,
        name: source.name,
        description: source.description,
        required: source.required,
        minSelect: source.minSelect,
        maxSelect: source.maxSelect,
        maxPerOption: source.maxPerOption,
        isHidden: source.isHidden,
        sortOrder: siblingCount + i,
        options: {
          create: source.options.map((opt, j) => ({
            name: opt.name,
            priceAdjustment: opt.priceAdjustment,
            isDefault: opt.isDefault,
            isAvailable: opt.isAvailable,
            sortOrder: j,
          })),
        },
      },
    });
  }
}

/**
 * One-off cleanup that removes pre-existing item-level modifier
 * attachments which DUPLICATE a category-level inheritance for the
 * same library group. Safe to run on every Pizza Builder save —
 * idempotent, no-op when no dupes exist. Removes the source of the
 * "item shows green chip while siblings show blue" bug for items that
 * were saved before the fix landed.
 */
export async function cleanupDuplicateInheritedAttachments(
  itemId: string,
  restaurantId: string,
): Promise<number> {
  const item = await prisma.menuItem.findFirst({
    where: { id: itemId, restaurantId },
    select: { categoryId: true },
  });
  if (!item) return 0;

  const categoryAttachments = await prisma.modifierGroup.findMany({
    where: { categoryId: item.categoryId },
    select: { libraryGroupId: true },
  });
  const inheritedLibIds = categoryAttachments
    .map((g) => g.libraryGroupId)
    .filter((x): x is string => typeof x === "string");
  if (inheritedLibIds.length === 0) return 0;

  const r = await prisma.modifierGroup.deleteMany({
    where: {
      menuItemId: itemId,
      variantId: null,
      libraryGroupId: { in: inheritedLibIds },
    },
  });
  return r.count;
}
