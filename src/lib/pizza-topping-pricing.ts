/**
 * SHARED pizza topping-pricing engine (Luigi 2026-07-05).
 *
 * Until now the "Included Toppings + Price per Extra Topping" engine lived
 * ONLY in the PizzaBuilder's on-screen price; the orders route re-priced
 * every topping from the modifier option's own priceAdjustment. The two
 * disagreed whenever the engine price differed from the option price —
 * Luigi's $10/topping SUPER PARTY pizza charged $2.50/topping (option
 * price), and included-topping pizzas charged for toppings the builder
 * showed as free. This module is the single source both sides call, so
 * preview == charge by construction.
 *
 * Model (mirrors the builder semantics exactly):
 *  - extraToppingPrice > 0 → FLAT model: every topping line costs the flat
 *    price (halves × halfToppingMultiplier). includedToppings grants free
 *    credits in HALF-UNITS (1 whole topping = 2 half-units), consumed in
 *    line order with pro-rata partial credit.
 *  - extraToppingPrice = 0 → PER-OPTION model: each line costs its option's
 *    own priceAdjustment (halves × halfToppingMultiplier).
 *
 * "Light"/"Normal"/"Extra" describe the AMOUNT of a topping, NOT its price
 * (Luigi 2026-07-06): a topping is PAID once it's added, and going Light
 * neither surcharges nor discounts. The amount lives only in the kitchen
 * label (the ", Light" suffix the serializer adds) — the pricing engine
 * treats a light line EXACTLY like a normal one (same charge, consumes
 * credits the same). The ×N count stepper is the paid multiplier.
 *
 * EVERY line the kitchen makes is charged. There is deliberately NO
 * "whole supersedes its own half lines" dedupe: on the charge path isHalf
 * is derived from the client-supplied modifier NAME (route.ts), so a
 * dedupe that zeroed a half line whenever a same-option whole line was
 * present let a crafted checkout body stack whole + (L.H) + (R.H) of one
 * topping and be charged for only the whole while the kitchen printed —
 * and made — all three. The honest builder never emits a whole AND a half
 * of the same option (one placement per topping), so charging each line is
 * a no-op for real carts and closes the tamper hole (red-team 2026-07-06).
 *
 * Lines are PER UNIT (double pepperoni = two lines) — exactly how
 * pizzaCustomizationToModifiers serialises for the kitchen and the server.
 */

export type ToppingPricingConfig = {
  /** Effective flat price (variant-resolved). 0/absent = per-option model. */
  extraToppingPrice: number;
  /** Whole-topping free credits (flat model only). */
  includedToppings: number;
  /** 0..1 multiplier for half-pizza lines (default 0.5). */
  halfToppingMultiplier: number;
  /** "Removing toppings reduces the price" (Luigi 2026-07-09). DEFAULT true =
   *  SYMMETRIC "pay-per-topping": EVERY topping is charged the flat price and the
   *  `includedToppings` allowance is a BASE credit (see toppingBaseAdjust), so a
   *  pizza priced at the included count gets CHEAPER when a customer removes a
   *  topping and pricier when they add one — both directions. Explicit `false` =
   *  LEGACY behaviour: the first `includedToppings` are free credits and removing
   *  below them does not refund (only toppings BEYOND the count add cost). */
  reduceOnRemove?: boolean;
};

/** Symmetric "pay-per-topping" is the default; only an explicit false opts a
 *  pizza back into the legacy free-credit model. Per-option model (flat 0) has
 *  no included/flat concept, so it's never symmetric. */
const isSymmetric = (cfg: ToppingPricingConfig): boolean =>
  cfg.reduceOnRemove !== false && Number(cfg.extraToppingPrice) > 0;

export type ToppingChargeLine = {
  /** Modifier option id — identifies the line's option (not used for pricing). */
  optionId: string;
  /** The option's own priceAdjustment (per-option model). */
  optionPrice: number;
  /** True for a left/right half line ("(L.H) " / "(R.H) " prefix). */
  isHalf: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Per-line charges, same order as `lines`. Sum = the topping total. */
export function priceToppingLines(cfg: ToppingPricingConfig, lines: ToppingChargeLine[]): number[] {
  // Clamp identically to the orders route (route.ts pre-clamps pizzaConfig's
  // halfToppingMultiplier to [0,1] before calling us). Falling back to 0.5 for
  // an out-of-range value while the route clamped to 1.0 previously diverged
  // preview from charge (a half topping shown at ×0.5 but billed at ×1.0).
  const halfMult = typeof cfg.halfToppingMultiplier === "number"
    ? Math.max(0, Math.min(1, cfg.halfToppingMultiplier))
    : 0.5;
  const flat = Number(cfg.extraToppingPrice) > 0 ? Number(cfg.extraToppingPrice) : 0;

  if (flat <= 0) {
    // Per-option model — every line charged on its own merits.
    return lines.map((l) => round2(l.optionPrice * (l.isHalf ? halfMult : 1)));
  }

  if (isSymmetric(cfg)) {
    // Symmetric "pay-per-topping": every line is charged the flat price (halves
    // × halfMult). The `includedToppings` allowance is NOT free credits here —
    // it's a one-time BASE credit the caller applies via toppingBaseAdjust, so
    // removing a topping below the included count refunds. Luigi 2026-07-09.
    return lines.map((l) => round2(l.isHalf ? flat * halfMult : flat));
  }

  // LEGACY flat model with half-unit free credits (reduceOnRemove === false).
  let halfCreditsLeft = Math.max(0, Math.floor(Number(cfg.includedToppings) || 0)) * 2;
  return lines.map((l) => {
    let charge = l.isHalf ? flat * halfMult : flat;
    if (halfCreditsLeft > 0) {
      const creditCost = l.isHalf ? 1 : 2;
      const used = Math.min(creditCost, halfCreditsLeft);
      charge = Math.max(0, charge - charge * (used / creditCost));
      halfCreditsLeft -= used;
    }
    return round2(charge);
  });
}

/**
 * One-time BASE-price credit for the `includedToppings` under SYMMETRIC pricing.
 * The item's price is the "list price" AT the included count (e.g. a $20 pizza
 * with 5 included @ $2 = a $10 effective base + 5 paid toppings). Since
 * priceToppingLines charges EVERY topping in symmetric mode, the caller subtracts
 * this credit (= includedToppings × flat) from the pizza base once, so:
 *
 *   pizzaTotal = max(0, base + toppingBaseAdjust(cfg) + Σ priceToppingLines(cfg,lines))
 *
 * At the included count the toppings add back exactly what this removes → the
 * list price. Below → cheaper; above → pricier. Returns 0 (no adjustment) in
 * legacy or per-option mode. Both the preview and the charge MUST apply this to
 * the SAME base with the SAME cfg, or preview ≠ charge. Luigi 2026-07-09.
 */
export function toppingBaseAdjust(cfg: ToppingPricingConfig): number {
  if (!isSymmetric(cfg)) return 0;
  const flat = Number(cfg.extraToppingPrice);
  const included = Math.max(0, Math.floor(Number(cfg.includedToppings) || 0));
  return -round2(included * flat);
}

/** Half-placement detector shared with the orders route: the serializer marks
 *  left/right-half lines with "(L.H) "/"(R.H) " prefixes (see
 *  pizzaCustomizationToModifiers). The ", Light" suffix is a kitchen label
 *  only — it never affects price, so there is no light-name parser. */
export const isHalfToppingName = (name: unknown): boolean =>
  typeof name === "string" && (name.startsWith("(L.H) ") || name.startsWith("(R.H) "));
