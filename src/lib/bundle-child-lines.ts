/**
 * Shared formatter for a bundle/combo CHILD's build detail (Luigi 2026-07-08).
 *
 * A combo/meal-bundle is persisted as ONE OrderItem whose child picks live in
 * `bundleItems` (JSON). Each child can carry its full build in `modifiers` —
 * already PRE-FLATTENED at capture time (ComboComposerModal turns a pizza
 * child's PizzaCustomization into "+ Crust", "(L.H) Pepperoni", … lines via
 * pizzaCustomizationToModifiers, and a modifier child's picks into
 * {name, priceAdjustment} entries). So EVERY display surface only needs to
 * render `child.modifiers` (+ notes) — never re-derive from pizzaCustomization
 * downstream (those surfaces don't have the child's modifierGroups).
 *
 * This helper is the single choke point so the cart, checkout, confirmation,
 * status, admin order detail, admin receipt preview, kitchen display and emails
 * all show the SAME child build and never diverge. It's a PURE data formatter
 * (no JSX) so it works in every runtime (client, RSC, email, receipt text);
 * each caller maps the result into its own markup/idiom.
 */
export interface BundleChildLike {
  name?: string;
  variantName?: string | null;
  modifiers?: Array<{ name: string; priceAdjustment?: number }> | null;
  notes?: string | null;
  specialityFee?: number;
  extrasFee?: number;
}

export interface ChildBuildLines {
  /** Modifier / pizza-build lines, normalized. `name` already encodes half
   *  markers (e.g. "(L.H) Pepperoni"). `priceAdjustment` is 0 when absent. */
  modifierLines: Array<{ name: string; priceAdjustment: number }>;
  /** Trimmed customer note for this child, or null. */
  notes: string | null;
}

export function childBuildLines(child: BundleChildLike | null | undefined): ChildBuildLines {
  return {
    modifierLines: (child?.modifiers ?? [])
      .filter((m) => m && typeof m.name === "string" && m.name.trim().length > 0)
      .map((m) => ({ name: m.name, priceAdjustment: m.priceAdjustment ?? 0 })),
    notes: child?.notes?.trim() || null,
  };
}
