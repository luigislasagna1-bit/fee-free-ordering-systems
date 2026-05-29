/**
 * Promotion type catalog — single source of truth for the 13 GloriaFood-parity
 * promo types. The admin wizard's Step 1 type picker reads from this list,
 * Step 2 dispatches to the matching config component, and the engine's
 * calcDiscount switch (src/lib/promo-engine.ts) cases on the same `slug`
 * values.
 *
 * Tier:
 *   "free"   → Types 1-5 are included for every restaurant on every plan.
 *   "locked" → Types 6-13 require the Advanced Promo Marketing add-on
 *              (slug "advanced_promos", $19.99/mo). The wizard renders a
 *              lock badge + upgrade CTA on these cards; the API rejects
 *              create/update of these types with 403 unless the
 *              restaurant has the `advanced_promo_types` feature.
 */

export type PromoTier = "free" | "locked";

export type PromoTypeMeta = {
  /** Engine + DB slug. Stable, never renamed. */
  slug: string;
  /** 1-based ordering used by the wizard cards. Matches the catalog
   *  doc (MARKETING-PROMO-CATALOG.md) numbering. */
  catalogNumber: number;
  /** Human-readable title shown on the wizard card + admin list. */
  name: string;
  /** One-sentence summary for the card subtitle. */
  description: string;
  /** Free vs gated. */
  tier: PromoTier;
  /** Lucide-react icon name. Resolved in the UI to keep this module
   *  framework-free (renderable from server components). */
  icon: string;
  /** Required restriction(s) inherent to the type — these are forced ON
   *  in the wizard regardless of what the owner picks. Used to short-
   *  circuit invalid configs (e.g. free_delivery is delivery-only). */
  forcedOrderTypes?: ("pickup" | "delivery" | "dine_in" | "catering" | "takeout")[];
  /** Whether this type needs an item group picker in Step 2. */
  needsItemGroups: boolean;
  /** Whether this type configures a meal-bundle (multiple required slots
   *  + a fixed bundle price). Types 8 and 13. */
  isBundle: boolean;
  /** Whether this type is a combo (multiple required item groups + a
   *  flat discount/percentage). Types 11 and 12. */
  isCombo: boolean;
};

/**
 * The catalog. Order = display order. Catalog numbers match the
 * MARKETING-PROMO-CATALOG.md screenshot sequence captured with Luigi.
 */
export const PROMO_TYPES: ReadonlyArray<PromoTypeMeta> = [
  {
    slug: "percentage_off",
    catalogNumber: 1,
    name: "% discount on cart",
    description: "Knock a percentage off the whole order (or specific items).",
    tier: "free",
    icon: "Percent",
    needsItemGroups: true, // optional item-targeting in Step 2
    isBundle: false,
    isCombo: false,
  },
  // Note: Type 2 ("% discount on selected items") is the same engine
  // type as Type 1 — the difference is purely UX-level (Step 2 forces
  // the item picker to be non-empty). We fold it into the same slug.
  // The catalog #2 appears in the wizard as a sub-variant of #1.
  {
    slug: "free_delivery",
    catalogNumber: 3,
    name: "Free delivery",
    description: "Waive the delivery fee for qualifying orders.",
    tier: "free",
    icon: "Truck",
    forcedOrderTypes: ["delivery"],
    needsItemGroups: false,
    isBundle: false,
    isCombo: false,
  },
  {
    slug: "bogo",
    catalogNumber: 4,
    name: "Buy one, get one free",
    description: "Pair a paid item with a free (or discounted) item.",
    tier: "free",
    icon: "Gift",
    needsItemGroups: true,
    isBundle: false,
    isCombo: false,
  },
  {
    slug: "fixed_cart",
    catalogNumber: 5,
    name: "Fixed discount on cart",
    description: "Knock a flat dollar amount off the order.",
    tier: "free",
    icon: "DollarSign",
    needsItemGroups: false,
    isBundle: false,
    isCombo: false,
  },
  {
    slug: "payment_reward",
    catalogNumber: 6,
    name: "Payment method reward",
    description: "Discount for paying with a specific method (e.g. cash).",
    tier: "locked",
    icon: "Wallet",
    needsItemGroups: false,
    isBundle: false,
    isCombo: false,
  },
  {
    slug: "free_item",
    catalogNumber: 7,
    name: "Get a FREE item",
    description: "Spend $X, get a free item from a curated list.",
    tier: "locked",
    icon: "PackageOpen",
    needsItemGroups: true, // the freebie picker
    isBundle: false,
    isCombo: false,
  },
  {
    slug: "meal_bundle",
    catalogNumber: 8,
    name: "Meal bundle",
    description: "Mix-and-match slots at a fixed bundle price.",
    tier: "locked",
    icon: "Boxes",
    needsItemGroups: true,
    isBundle: true,
    isCombo: false,
  },
  {
    slug: "buy_n_get_free",
    catalogNumber: 9,
    name: "Buy N, get one free",
    description: "Add N items, get the next one (cheapest or chosen) free.",
    tier: "locked",
    icon: "ShoppingBag",
    needsItemGroups: true,
    isBundle: false,
    isCombo: false,
  },
  {
    slug: "free_dish_meal",
    catalogNumber: 10,
    name: "Free dish as part of meal",
    description: "Order a main + side, get a dessert (or any extra) free.",
    tier: "locked",
    icon: "UtensilsCrossed",
    needsItemGroups: true,
    isBundle: false,
    isCombo: false,
  },
  {
    slug: "fixed_combo",
    catalogNumber: 11,
    name: "Fixed discount on combo",
    description: "Pair specific items together, knock a flat $ off.",
    tier: "locked",
    icon: "PackagePlus",
    needsItemGroups: true,
    isBundle: false,
    isCombo: true,
  },
  {
    slug: "percentage_combo",
    catalogNumber: 12,
    name: "% discount on combo",
    description: "Pair specific items together, knock a percentage off.",
    tier: "locked",
    icon: "BadgePercent",
    needsItemGroups: true,
    isBundle: false,
    isCombo: true,
  },
  {
    slug: "meal_bundle_speciality",
    catalogNumber: 13,
    name: "Meal bundle with speciality",
    description: "Meal bundle with optional upsell upcharges (e.g. lobster +$5).",
    tier: "locked",
    icon: "ChefHat",
    needsItemGroups: true,
    isBundle: true,
    isCombo: false,
  },
] as const;

/** Set of slugs that are gated behind the Advanced Promo Marketing add-on.
 *  The API entitlement check uses this for fail-fast 403. */
export const LOCKED_PROMO_SLUGS: ReadonlySet<string> = new Set(
  PROMO_TYPES.filter((t) => t.tier === "locked").map((t) => t.slug)
);

/** Look up a single type. Returns undefined for unknown slugs. */
export function getPromoTypeMeta(slug: string): PromoTypeMeta | undefined {
  return PROMO_TYPES.find((t) => t.slug === slug);
}

/** True when the type requires the advanced-promos add-on. Cheap inline
 *  check — does NOT consult the database. Pair with hasFeature() for the
 *  actual entitlement gate. */
export function isLockedType(slug: string): boolean {
  return LOCKED_PROMO_SLUGS.has(slug);
}

/** The single add-on slug that unlocks all locked types. Kept here so
 *  the UI's "upgrade to unlock" CTA + the API gate read the same value. */
export const ADVANCED_PROMO_ADDON_SLUG = "advanced_promos";

/** The Feature slug (entitlement set) that gates the locked types.
 *  Granted by the advanced_promos add-on's `enabledFeatures` array. */
export const ADVANCED_PROMO_FEATURE = "advanced_promo_types" as const;
