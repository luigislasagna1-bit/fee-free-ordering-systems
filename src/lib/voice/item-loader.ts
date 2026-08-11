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
    // ⚠️ DE-DUPLICATE by the exposed (library) id. The same library group can be
    // attached BOTH to the item and to its category — a real pre-2026-06-01
    // shape. Both copies carry the same option NAMES, so an un-deduped union
    // made every topping "ambiguous" and the compiler refused all of them:
    // "large with mushrooms" became an unanswerable question. Item-level wins,
    // matching what dedupe-modifier-attachments treats as canonical.
    modifierGroups: dedupeGroups([
      ...shapeGroups(it.modifierGroups as unknown as RawGroup[]),
      ...shapeGroups((it.category?.modifierGroups ?? []) as unknown as RawGroup[]),
    ]),
    pizzaConfig: parsePizzaConfig((it as { pizzaConfig?: string | null }).pizzaConfig),
  };
}

function dedupeGroups<T extends { id: string; attachedId?: string }>(groups: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const g of groups) {
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    out.push(g);
  }
  return out;
}

/** Null when the item isn't a combo. Resolves every slot's eligible picks so
 *  the agent can offer them and the compiler can validate them. */
export async function loadComboData(
  menuRestaurantId: string,
  it: LoadedItem,
): Promise<ComboData | null> {
  const combo = parseComboConfig((it as { comboConfig?: string | null }).comboConfig);
  if (!combo) return null;

  // ONE query for every slot, not one per slot. This runs on the critical path
  // of a live phone call: the old per-slot loop issued N deep queries (variants
  // + modifier groups + options + category groups, ×40 rows each) back to back,
  // and the caller heard the silence.
  const allIds = [...new Set(combo.slots.flatMap((s) => s.itemIds ?? []))];
  const allCats = [...new Set(combo.slots.flatMap((s) => s.categoryIds ?? []))];
  const CHOICE_CAP = 120;
  const pool =
    allIds.length || allCats.length
      ? await prisma.menuItem.findMany({
          where: {
            restaurantId: menuRestaurantId,
            isAvailable: true,
            // Never offer food the kitchen has 86'd — the order route rejects
            // it, and by then the agent has spent 90 seconds building a combo
            // it now has to unwind.
            isSoldOut: false,
            OR: [
              ...(allIds.length ? [{ id: { in: allIds } }] : []),
              ...(allCats.length ? [{ categoryId: { in: allCats } }] : []),
            ],
          },
          include: VOICE_ITEM_INCLUDE,
          // Deterministic, so the same caller is offered the same choices and
          // a truncated list truncates the same way every time.
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          take: CHOICE_CAP,
        })
      : [];
  const truncated = pool.length >= CHOICE_CAP;

  const slots: ComboData["slots"] = [];
  for (const slot of combo.slots) {
    const byId = new Set(slot.itemIds ?? []);
    const byCat = new Set(slot.categoryIds ?? []);
    if (!byId.size && !byCat.size) continue;
    const choices = pool.filter((c) => byId.has(c.id) || (c.categoryId && byCat.has(c.categoryId)));
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
    isSoldOut: it.isSoldOut,
    choicesTruncated: truncated,
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
