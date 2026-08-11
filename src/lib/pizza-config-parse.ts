/**
 * PURE parser for `MenuItem.pizzaConfig` (a JSON string column).
 *
 * Extracted 2026-08-11 from `src/app/order/[slug]/PizzaBuilder.tsx`, which is a
 * `"use client"` module and therefore unusable from server code. The customer
 * builder now re-exports these so there is ONE definition of the pizza config
 * shape shared by the builder and the voice order compiler.
 *
 * No imports on purpose — safe in a React client component, a route handler, a
 * vitest unit test, and the voice tool executor alike.
 *
 * ⚠️ `src/app/api/orders/route.ts` deliberately keeps its own narrower inline
 * parse for the CHARGE path (it reads a clamped subset: halfToppingMultiplier,
 * toppingGroupIds, variantToppingPrices, extraToppingPrice, includedToppings,
 * reduceOnRemove). That is the authoritative money parse and is not changed
 * here. This module drives conversation + advisory quoting; the authoritative
 * total always comes back from the order route itself (dryRun or the 201).
 */

export interface PizzaConfig {
  isPizza: boolean;
  allowHalfHalf: boolean;
  /** Modifier group ID for crust selection */
  crustGroupId?: string;
  /** Modifier group ID for sauce selection */
  sauceGroupId?: string;
  /** Modifier group ID for cheese selection */
  cheeseGroupId?: string;
  /** One or more modifier group IDs containing toppings */
  toppingGroupIds: string[];
  /** How many toppings are included in the base price (0 = all toppings charged
   *  individually via option.priceAdjustment) */
  includedToppings: number;
  /** When true, topping selection is OPTIONAL (customer may pick 0). */
  toppingsOptional?: boolean;
  /** Price per topping when includedToppings > 0; ignored when 0. */
  extraToppingPrice: number;
  /** Per-variant topping prices keyed by variant NAME (not id). */
  variantToppingPrices?: Record<string, number>;
  /** Default true = symmetric pay-per-topping (removing below the included
   *  count refunds). Only an explicit false selects the legacy free-credit
   *  model. */
  reduceOnRemove?: boolean;
  /** Topping OPTION ids that pre-fill the included slots (whole, normal). */
  presetToppings?: string[];
  /** Garnish option NAMES that open pre-selected on this pizza. */
  presetGarnishes?: string[];
  /** Multiplier applied to half-pizza toppings (default 0.5). */
  halfToppingMultiplier: number;
  /** Upcharge multiplier for "Extra" amount. NOTE: never applied server-side
   *  (TODO.md) — do not quote money from it. */
  extraQuantityMultiplier: number;
  /** Allow multiple of the same topping (double pepperoni), each counted
   *  separately. Default true. */
  allowMultipleToppings?: boolean;
  /** Customer-facing section display order (builder UI only). */
  sectionOrder?: string[];
  /** Which pizza-roles expose the Whole/Split UI. */
  halfHalfRoles?: Array<"sauce" | "cheese" | "toppings">;
}

export function parsePizzaConfig(json: string | null | undefined): PizzaConfig | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json);
    if (!c?.isPizza) return null;
    return {
      isPizza: true,
      allowHalfHalf: c.allowHalfHalf ?? true,
      crustGroupId: c.crustGroupId ?? undefined,
      sauceGroupId: c.sauceGroupId ?? undefined,
      cheeseGroupId: c.cheeseGroupId ?? undefined,
      toppingGroupIds: Array.isArray(c.toppingGroupIds) ? c.toppingGroupIds : [],
      includedToppings: Number(c.includedToppings) || 0,
      toppingsOptional: c.toppingsOptional === true,
      extraToppingPrice: Number(c.extraToppingPrice) || 0,
      variantToppingPrices:
        c.variantToppingPrices && typeof c.variantToppingPrices === "object"
          ? Object.fromEntries(
              Object.entries(c.variantToppingPrices).map(([k, v]) => [k, Number(v) || 0]),
            )
          : undefined,
      // Default true (symmetric pay-per-topping) — only an explicit false opts
      // a pizza into the legacy free-credit model. Luigi 2026-07-09.
      reduceOnRemove: c.reduceOnRemove !== false,
      presetToppings: Array.isArray(c.presetToppings)
        ? c.presetToppings.filter((x: unknown): x is string => typeof x === "string")
        : undefined,
      presetGarnishes: Array.isArray(c.presetGarnishes)
        ? c.presetGarnishes.filter((x: unknown): x is string => typeof x === "string")
        : undefined,
      halfToppingMultiplier: Number(c.halfToppingMultiplier) || 0.5,
      extraQuantityMultiplier: Number(c.extraQuantityMultiplier) || 0,
      allowMultipleToppings: c.allowMultipleToppings !== false, // default ON
      sectionOrder: Array.isArray(c.sectionOrder)
        ? c.sectionOrder.filter((x: unknown): x is string => typeof x === "string")
        : undefined,
      halfHalfRoles: Array.isArray(c.halfHalfRoles)
        ? c.halfHalfRoles.filter(
            (r: unknown): r is "sauce" | "cheese" | "toppings" =>
              r === "sauce" || r === "cheese" || r === "toppings",
          )
        : undefined,
    };
  } catch {
    return null;
  }
}
