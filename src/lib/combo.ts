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
};

export type ComboConfig = { slots: ComboSlot[] };

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
    slots.push({
      id: typeof s.id === "string" && s.id ? s.id : `slot-${slots.length + 1}`,
      label: typeof s.label === "string" ? s.label : "",
      min: min === 0 ? 0 : min,
      max,
      itemIds,
      categoryIds,
      upcharges: Object.keys(upcharges).length ? upcharges : undefined,
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
