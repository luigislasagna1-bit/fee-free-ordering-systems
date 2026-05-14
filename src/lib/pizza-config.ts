import prisma from "@/lib/db";

type PizzaConfigShape = {
  crustGroupId?: string;
  sauceGroupId?: string;
  cheeseGroupId?: string;
  toppingGroupIds?: string[];
};

// Ensures every library modifier group referenced in `pizzaConfig` is attached
// to the menu item. Pizza-tab dropdowns in the admin pick a library group ID
// and store it in pizzaConfig; the customer-side PizzaBuilder looks them up
// via item.modifierGroups (matching by libraryGroupId), so an attachment must
// exist or the selector will not render.
//
// Idempotent: skips IDs that already have an attachment. Does NOT remove
// attachments when an ID is dropped from pizzaConfig — admins detach via
// drag-and-drop if they want a group gone.
export async function syncPizzaConfigAttachments(
  itemId: string,
  restaurantId: string,
  pizzaConfig: string | null | undefined,
): Promise<void> {
  if (!pizzaConfig) return;

  let parsed: PizzaConfigShape;
  try {
    parsed = JSON.parse(pizzaConfig);
  } catch {
    return;
  }

  const ids = [
    parsed.crustGroupId,
    parsed.sauceGroupId,
    parsed.cheeseGroupId,
    ...(parsed.toppingGroupIds ?? []),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);

  if (ids.length === 0) return;

  const uniqueIds = Array.from(new Set(ids));

  const [sources, existing] = await Promise.all([
    prisma.modifierGroup.findMany({
      where: { id: { in: uniqueIds }, restaurantId },
      include: { options: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.modifierGroup.findMany({
      where: { menuItemId: itemId, libraryGroupId: { in: uniqueIds } },
      select: { libraryGroupId: true },
    }),
  ]);

  const alreadyAttached = new Set(existing.map((g) => g.libraryGroupId));
  const toAttach = sources.filter((s) => !alreadyAttached.has(s.id));
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
