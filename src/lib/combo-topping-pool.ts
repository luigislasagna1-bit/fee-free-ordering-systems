/**
 * SHARED-POOL topping allocator for pizza combos (Luigi 2026-08-02).
 *
 * A combo can declare `sharedToppings: N` — N whole toppings covered by the
 * combo price and shared by EVERY pizza in it, replacing each pizza's own
 * `includedToppings` while inside this combo. "2 large pizzas, 6 toppings
 * combined": 1 topping on pizza A leaves 5 free for pizza B; the 7th costs
 * that pizza's normal extra-topping rate. No platform we benchmarked
 * (GloriaFood / Toast / Square / Olo / SpeedLine) can express this — the
 * vocabulary here is ours, so keep the semantics boring and predictable:
 *
 *  - The pool is counted in HALF-UNITS (1 whole topping = 2), the same unit
 *    the per-pizza engine uses, so half-pizza toppings cost half a credit.
 *  - Children are consumed IN ARRAY ORDER and lines in builder order. The
 *    array order is the bundleItems order (composer slot order), identical
 *    on the client and the server — that is the determinism contract that
 *    keeps preview == charge.
 *  - A line's full price is the pizza's own variant-resolved flat rate
 *    (or the option's own price for per-option pizzas, flat = 0) — so the
 *    overage rate follows each pizza, exactly like ordering it alone.
 *  - Partial credit is pro-rata (1 half-unit left against a whole line =
 *    half price), mirroring priceToppingLines' legacy branch.
 *  - `toppingBaseAdjust` must NEVER be applied to a pool participant — the
 *    pool replaces the allowance, and the per-pizza base credit would
 *    double-count it. Callers own that rule; this module never adjusts base.
 *  - Charges here are BOTH the money and the per-line display: first-N-free
 *    is precisely what the receipt should show, so there is no separate
 *    display function in pool mode.
 */
import type { ToppingChargeLine, ToppingPricingConfig } from "./pizza-topping-pricing";

export type PoolChildInput = {
  /** Variant-resolved engine config for THIS pizza. Only extraToppingPrice and
   *  halfToppingMultiplier are read — includedToppings / reduceOnRemove are
   *  deliberately ignored (the pool replaces them). */
  cfg: ToppingPricingConfig;
  /** Per-unit topping lines in builder order (count N = N lines). */
  lines: ToppingChargeLine[];
};

export type PoolChildResult = {
  /** Per-line charges, same order as the input lines. 0 = covered by the pool. */
  lineCharges: number[];
  /** Σ lineCharges, rounded. */
  toppingTotal: number;
  /** Half-units of the pool this child consumed. */
  halfUnitsUsed: number;
};

export type PoolAllocation = {
  children: PoolChildResult[];
  usedHalfUnits: number;
  poolHalfUnits: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Raw half-unit variant — also drives the live meter inside PizzaBuilder,
 *  which needs "the pool minus what the OTHER pizzas already used". */
export function allocateToppingPoolHalfUnits(
  poolHalfUnits: number,
  children: PoolChildInput[],
): PoolAllocation {
  const pool = Math.max(0, Math.floor(Number(poolHalfUnits) || 0));
  let left = pool;
  const out: PoolChildResult[] = children.map((ch) => {
    const halfMult = typeof ch.cfg.halfToppingMultiplier === "number"
      ? Math.max(0, Math.min(1, ch.cfg.halfToppingMultiplier))
      : 0.5;
    const flat = Number(ch.cfg.extraToppingPrice) > 0 ? Number(ch.cfg.extraToppingPrice) : 0;
    let used = 0;
    const lineCharges = ch.lines.map((l) => {
      // Full price first: the pizza's flat rate, or the option's own price on a
      // per-option pizza. Halves scale by the pizza's own multiplier either way.
      let charge = flat > 0
        ? (l.isHalf ? flat * halfMult : flat)
        : Math.max(0, l.optionPrice) * (l.isHalf ? halfMult : 1);
      const creditCost = l.isHalf ? 1 : 2;
      if (left > 0) {
        const take = Math.min(creditCost, left);
        charge = Math.max(0, charge - charge * (take / creditCost)); // pro-rata
        left -= take;
        used += take;
      }
      return round2(charge);
    });
    return {
      lineCharges,
      toppingTotal: round2(lineCharges.reduce((s, c) => s + c, 0)),
      halfUnitsUsed: used,
    };
  });
  return { children: out, usedHalfUnits: pool - left, poolHalfUnits: pool };
}

/** Whole-topping entry point: `sharedToppings` as the owner configures it. */
export function allocateToppingPool(
  sharedToppings: number,
  children: PoolChildInput[],
): PoolAllocation {
  return allocateToppingPoolHalfUnits(Math.max(0, Math.floor(Number(sharedToppings) || 0)) * 2, children);
}
