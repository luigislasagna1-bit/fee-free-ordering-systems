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
 *    line order with pro-rata partial credit. "Light" lines are free and
 *    consume no credit.
 *  - extraToppingPrice = 0 → PER-OPTION model: each line costs its option's
 *    own priceAdjustment (halves × halfToppingMultiplier, light = 0).
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
};

export type ToppingChargeLine = {
  /** Modifier option id — used for the whole-supersedes-half dedupe. */
  optionId: string;
  /** The option's own priceAdjustment (per-option model). */
  optionPrice: number;
  /** True for a left/right half line ("(L.H) " / "(R.H) " prefix). */
  isHalf: boolean;
  /** True for a "Light" quantity line — always free. */
  isLight: boolean;
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
    return lines.map((l) => (l.isLight ? 0 : round2(l.optionPrice * (l.isHalf ? halfMult : 1))));
  }

  // Flat model with half-unit credits.
  let halfCreditsLeft = Math.max(0, Math.floor(Number(cfg.includedToppings) || 0)) * 2;
  return lines.map((l) => {
    if (l.isLight) return 0;
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

/** Modifier-line helpers shared with the orders route: the serializer marks
 *  half lines with "(L.H) "/"(R.H) " prefixes and light lines with a
 *  ", Light" suffix (see pizzaCustomizationToModifiers). */
export const isHalfToppingName = (name: unknown): boolean =>
  typeof name === "string" && (name.startsWith("(L.H) ") || name.startsWith("(R.H) "));
export const isLightToppingName = (name: unknown): boolean =>
  typeof name === "string" && name.endsWith(", Light");
