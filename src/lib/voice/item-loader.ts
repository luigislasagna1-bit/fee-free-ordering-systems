import "server-only";
import prisma from "@/lib/db";
import { parsePizzaConfig } from "@/lib/pizza-config-parse";
import { parseComboConfig, comboAllowedVariantIds, comboUpchargeFor } from "@/lib/combo";
import type { ComboData, ItemData } from "@/lib/voice/order-line-compiler";

/**
 * Loads ONE menu item (or combo) in the exact shape the voice order compiler
 * consumes. Shared by `/api/internal/voice/item-options` (what the agent reads
 * aloud) and `/api/internal/voice/build-line` (what it orders), so the options
 * a caller is offered and the payload that gets built can never drift apart.
 */

export const VOICE_ITEM_INCLUDE = {
  variants: { orderBy: { sortOrder: "asc" as const } },
  modifierGroups: {
    where: { isHidden: false },
    orderBy: { sortOrder: "asc" as const },
    include: { options: { where: { isAvailable: true }, orderBy: { sortOrder: "asc" as const } } },
  },
  category: {
    include: {
      modifierGroups: {
        where: { menuItemId: null, isHidden: false },
        orderBy: { sortOrder: "asc" as const },
        include: { options: { where: { isAvailable: true }, orderBy: { sortOrder: "asc" as const } } },
      },
    },
  },
};

type RawGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  pizzaRole: string | null;
  libraryGroupId?: string | null;
  options: Array<{ id: string; name: string; priceAdjustment: number; isDefault: boolean }>;
};

function shapeGroups(groups: RawGroup[]) {
  return groups.map((g) => ({
    // pizzaConfig references the LIBRARY group id while an attached copy has
    // its own — expose the library id as `id` so pizzaConfig lookups resolve,
    // and keep the attached id for debugging.
    id: g.libraryGroupId ?? g.id,
    attachedId: g.id,
    name: g.name,
    required: g.required,
    minSelect: g.minSelect,
    maxSelect: g.maxSelect,
    pizzaRole: g.pizzaRole ?? null,
    options: g.options.map((o) => ({
      modifierOptionId: o.id,
      name: o.name,
      priceAdjustment: o.priceAdjustment,
      isDefault: o.isDefault,
    })),
  }));
}

type LoadedItem = NonNullable<Awaited<ReturnType<typeof loadRawItem>>>;

export async function loadRawItem(menuRestaurantId: string, itemId: string) {
  return prisma.menuItem.findFirst({
    where: { id: itemId, restaurantId: menuRestaurantId, isAvailable: true },
    include: VOICE_ITEM_INCLUDE,
  });
}

/** Item-level groups UNIONED with category-level — the same union the orders
 *  route validates against. A mismatch here is a preview≠charge seam. */
export function shapeItemData(it: LoadedItem): ItemData {
  return {
    menuItemId: it.id,
    name: it.name,
    price: it.price,
    isSoldOut: it.isSoldOut,
    hasVariants: it.hasVariants,
    variants: it.variants.map((v) => ({
      variantId: v.id,
      name: v.name,
      price: v.price,
      isDefault: v.isDefault,
    })),
    modifierGroups: [
      ...shapeGroups(it.modifierGroups as unknown as RawGroup[]),
      ...shapeGroups((it.category?.modifierGroups ?? []) as unknown as RawGroup[]),
    ],
    pizzaConfig: parsePizzaConfig((it as { pizzaConfig?: string | null }).pizzaConfig),
  };
}

/** Null when the item isn't a combo. Resolves every slot's eligible picks so
 *  the agent can offer them and the compiler can validate them. */
export async function loadComboData(
  menuRestaurantId: string,
  it: LoadedItem,
): Promise<ComboData | null> {
  const combo = parseComboConfig((it as { comboConfig?: string | null }).comboConfig);
  if (!combo) return null;

  const slots: ComboData["slots"] = [];
  for (const slot of combo.slots) {
    const byId = slot.itemIds ?? [];
    const byCat = slot.categoryIds ?? [];
    if (!byId.length && !byCat.length) continue;
    const choices = await prisma.menuItem.findMany({
      where: {
        restaurantId: menuRestaurantId,
        isAvailable: true,
        OR: [
          ...(byId.length ? [{ id: { in: byId } }] : []),
          ...(byCat.length ? [{ categoryId: { in: byCat } }] : []),
        ],
      },
      include: VOICE_ITEM_INCLUDE,
      take: 40,
    });
    slots.push({
      id: slot.id,
      label: slot.label,
      min: slot.min,
      max: slot.max,
      choices: choices.map((c) => {
        const shaped = shapeItemData(c);
        // A slot can restrict which sizes are orderable inside the combo; the
        // route 400s on a variant outside that set, so never offer one.
        const allowed = comboAllowedVariantIds(slot, c.id);
        return allowed
          ? { ...shaped, variants: shaped.variants.filter((v) => allowed.includes(v.variantId)) }
          : shaped;
      }),
    });
  }

  return {
    menuItemId: it.id,
    name: it.name,
    price: it.price,
    extrasCharge: combo.extrasCharge,
    sharedToppings: combo.sharedToppings ?? undefined,
    slots,
  };
}

/** Per-item upcharges for a combo slot, for read-back only. */
export function slotUpcharge(
  slot: { itemIds?: string[]; categoryIds?: string[]; upcharges?: Record<string, number> },
  itemId: string,
): number {
  return comboUpchargeFor(slot as never, itemId);
}
