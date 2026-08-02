/**
 * Display-side aggregation of identical combo/bundle children (Luigi
 * 2026-08-02, the GloriaFood "3x Suicide (wing dip)" pattern).
 *
 * The cart/order data model stays one array entry per unit — the server counts
 * entries for slot min/max, and every money path sums per entry. This helper
 * is DISPLAY ONLY: surfaces that render `bundleItems` call it to collapse
 * runs of identical children into one line with a quantity ("4x Coke" instead
 * of four "1x Coke" lines).
 *
 * Two children are "identical" only when nothing distinguishes them on paper:
 * same item, same size, same modifier lines (names AND prices, in order),
 * same note, same fees — and NEITHER is a customized pizza (two pizzas are
 * never collapsed; the kitchen builds each one separately).
 */
export interface GroupableChild {
  menuItemId?: string;
  name?: string;
  variantId?: string | null;
  variantName?: string | null;
  modifiers?: Array<{ name: string; priceAdjustment?: number }> | null;
  notes?: string | null;
  specialityFee?: number;
  extrasFee?: number;
  pizzaCustomization?: unknown;
}

export type GroupedChild<T extends GroupableChild> = { child: T; qty: number };

function childSignature(c: GroupableChild): string | null {
  // A pizza build is never collapsed — even "identical" pizzas are separate
  // physical builds on the make line.
  if (c.pizzaCustomization) return null;
  return JSON.stringify([
    c.menuItemId ?? c.name ?? "",
    c.variantId ?? c.variantName ?? "",
    (c.modifiers ?? []).map((m) => [m.name, m.priceAdjustment ?? 0]),
    c.notes ?? "",
    c.specialityFee ?? 0,
    c.extrasFee ?? 0,
  ]);
}

/** Collapse consecutive AND non-consecutive identical children, preserving
 *  first-appearance order. */
export function groupBundleChildren<T extends GroupableChild>(children: T[]): Array<GroupedChild<T>> {
  const out: Array<GroupedChild<T>> = [];
  const bySig = new Map<string, GroupedChild<T>>();
  for (const child of children) {
    const sig = childSignature(child);
    if (sig !== null) {
      const existing = bySig.get(sig);
      if (existing) { existing.qty += 1; continue; }
      const entry = { child, qty: 1 };
      bySig.set(sig, entry);
      out.push(entry);
      continue;
    }
    out.push({ child, qty: 1 });
  }
  return out;
}
