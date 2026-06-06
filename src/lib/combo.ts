/**
 * Combo menu items — a single orderable menu item composed of several "slots"
 * (e.g. "2-Pizza Combo": Slot 1 = a pizza, Slot 2 = a pizza; or "Pizza + Wings":
 * Slot 1 = a pizza, Slot 2 = wings). Pizza-builder items inside a slot open the
 * full pizza builder so each pizza is customizable. The combo shows as ONE menu
 * line at the item's price + any premium upcharges — no promotion required.
 *
 * Stored as JSON in MenuItem.comboConfig. Single source of truth for the type +
 * validation, shared by the admin builder, the customer composer, and the
 * server price re-check. Luigi 2026-06-05.
 */

export type ComboSlot = {
  id: string;
  label: string;
  /** Required picks for this slot (usually 1). */
  min: number;
  /** Max picks for this slot (usually 1). */
  max: number;
  /** Explicit eligible item ids. */
  itemIds: string[];
  /** Eligible-by-category ids (the pool = items in these categories ∪ itemIds). */
  categoryIds: string[];
  /** Optional per-item premium upcharge (itemId → extra fee added to the combo). */
  upcharges?: Record<string, number>;
  /** Per-item allowed variant (size) ids: itemId → variantIds[]. When present
   *  and non-empty, ONLY these sizes of that item are offered in the combo —
   *  e.g. a "Wings" item restricted to just the "20 pc" size. Absent ⇒ every
   *  variant is offered (customer picks the size). Single allowed variant ⇒
   *  auto-applied with no customer prompt. */
  itemVariants?: Record<string, string[]>;
  /** Per-variant premium upcharge, key `${itemId}::${variantId}` → extra fee.
   *  Lets "20 wings" carry a higher upcharge than "10 wings" in the same combo.
   *  Falls back to the item-level `upcharges[itemId]` when no entry exists. */
  variantUpcharges?: Record<string, number>;
};

export type ComboConfig = { slots: ComboSlot[] };

/** Stable key for a per-(item,variant) entry in `variantUpcharges`. */
export function comboVariantKey(itemId: string, variantId: string): string {
  return `${itemId}::${variantId}`;
}

/** The variant ids a slot allows for an item, or null when unrestricted (all
 *  the item's variants are offered). Shared by composer + server so the rule
 *  is identical on both sides. */
export function comboAllowedVariantIds(slot: ComboSlot, itemId: string): string[] | null {
  const v = slot.itemVariants?.[itemId];
  return Array.isArray(v) && v.length > 0 ? v : null;
}

/** Resolve the upcharge for a pick: per-variant first, then per-item, else 0. */
export function comboUpchargeFor(slot: ComboSlot, itemId: string, variantId?: string | null): number {
  if (variantId && slot.variantUpcharges) {
    const k = comboVariantKey(itemId, variantId);
    if (Number.isFinite(slot.variantUpcharges[k])) return slot.variantUpcharges[k];
  }
  return slot.upcharges?.[itemId] ?? 0;
}

/** Parse + normalize a raw comboConfig value (string or object). Returns null
 *  when it isn't a usable combo (no slots) so callers can treat the item as a
 *  normal menu item. Always returns a complete, trustworthy shape. */
export function parseComboConfig(raw: unknown): ComboConfig | null {
  let obj: any = raw;
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try { obj = JSON.parse(raw); } catch { return null; }
  }
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.slots)) return null;

  const slots: ComboSlot[] = [];
  for (const s of obj.slots) {
    if (!s || typeof s !== "object") continue;
    const itemIds = Array.isArray(s.itemIds) ? s.itemIds.filter((x: unknown) => typeof x === "string") : [];
    const categoryIds = Array.isArray(s.categoryIds) ? s.categoryIds.filter((x: unknown) => typeof x === "string") : [];
    if (itemIds.length === 0 && categoryIds.length === 0) continue; // empty pool → skip
    const min = Math.max(0, Number.isFinite(s.min) ? Math.floor(s.min) : 1);
    const max = Math.max(min || 1, Number.isFinite(s.max) ? Math.floor(s.max) : 1);
    const upcharges: Record<string, number> = {};
    if (s.upcharges && typeof s.upcharges === "object") {
      for (const [k, v] of Object.entries(s.upcharges)) {
        const n = Number(v);
        if (typeof k === "string" && Number.isFinite(n) && n > 0) upcharges[k] = n;
      }
    }
    // Per-item allowed variant ids — only keep entries for items in this slot's
    // explicit pool (a category-only item can't have a variant restriction we
    // can resolve here, and we don't want stale keys bloating the JSON).
    const itemVariants: Record<string, string[]> = {};
    if (s.itemVariants && typeof s.itemVariants === "object") {
      for (const [k, v] of Object.entries(s.itemVariants)) {
        if (typeof k !== "string" || !Array.isArray(v)) continue;
        const ids = v.filter((x) => typeof x === "string") as string[];
        if (ids.length) itemVariants[k] = ids;
      }
    }
    const variantUpcharges: Record<string, number> = {};
    if (s.variantUpcharges && typeof s.variantUpcharges === "object") {
      for (const [k, v] of Object.entries(s.variantUpcharges)) {
        const n = Number(v);
        if (typeof k === "string" && Number.isFinite(n) && n > 0) variantUpcharges[k] = n;
      }
    }
    slots.push({
      id: typeof s.id === "string" && s.id ? s.id : `slot-${slots.length + 1}`,
      label: typeof s.label === "string" ? s.label : "",
      min: min === 0 ? 0 : min,
      max,
      itemIds,
      categoryIds,
      upcharges: Object.keys(upcharges).length ? upcharges : undefined,
      itemVariants: Object.keys(itemVariants).length ? itemVariants : undefined,
      variantUpcharges: Object.keys(variantUpcharges).length ? variantUpcharges : undefined,
    });
  }
  if (slots.length === 0) return null;
  return { slots };
}

/** True when an item is a combo (has a usable comboConfig). */
export function isComboItem(item: { comboConfig?: string | null }): boolean {
  return parseComboConfig(item.comboConfig) !== null;
}

/** A customer's pick for one slot — references a menu item + optional variant
 *  + optional pizza customization (carried for the kitchen) + the upcharge that
 *  applied. Stored on the order so receipts/kitchen can render the combo parts. */
export type ComboSelectionItem = {
  slotId: string;
  menuItemId: string;
  name: string;
  variantId?: string | null;
  variantName?: string | null;
  /** Pizza builder customization (half/half, toppings) when the slot pick is a
   *  pizza-builder item — opaque passthrough validated against the item. */
  pizzaCustomization?: unknown;
  upcharge?: number;
};
