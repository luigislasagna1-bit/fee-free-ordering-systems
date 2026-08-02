/**
 * Server-grade pricing for PIZZA children inside a combo (Luigi 2026-08-02).
 *
 * Until now the orders route TRUSTED the client's `extrasFee` on combo pizza
 * children (route.ts combo branch) — the one hole left in the preview==charge
 * rule. This module closes it: given the child's stored modifier lines and the
 * item's real DB modifier groups, it re-derives the money exactly the way the
 * composer previews it. It is pure and runtime-agnostic on purpose — the
 * ComboComposerModal calls the SAME function for its on-screen fees, so the
 * preview and the charge cannot disagree by construction.
 *
 * Two modes:
 *  - PER-PIZZA (default): the child's own pizzaConfig allowance — engine
 *    charges via priceToppingLines + toppingBaseAdjust, display labels via
 *    priceToppingLinesForDisplay (the standalone-pizza pattern, route.ts
 *    :1264-1289).
 *  - POOL (comboConfig.sharedToppings >= 1): every pizza child's topping lines
 *    run through ONE allocateToppingPool walk in child order; per-pizza
 *    includedToppings and toppingBaseAdjust are structurally bypassed (the
 *    pool replaces the allowance — applying both would double-credit).
 *    Pool overage is charged even when `extrasCharge` is off: the pool's
 *    number IS the owner's price promise. extrasCharge keeps gating
 *    non-topping extras (paid crusts, sauces, garnishes).
 *
 * Unknown modifier option ids are DROPPED (not 400s) — consistent with the
 * non-pizza combo child branch, so a menu edit mid-cart degrades instead of
 * hard-failing checkout. Dropped lines neither charge nor consume pool
 * credits nor print.
 */
import {
  isHalfToppingName,
  priceToppingLines,
  priceToppingLinesForDisplay,
  toppingBaseAdjust,
  type ToppingChargeLine,
  type ToppingPricingConfig,
} from "./pizza-topping-pricing";
import { allocateToppingPool } from "./combo-topping-pool";

export type ComboChildGroup = {
  id: string;
  libraryGroupId?: string | null;
  options: Array<{ id: string; name: string; priceAdjustment: number }>;
};

export type ComboPizzaChildInput = {
  /** The child item's raw pizzaConfig JSON (string). Unparsable/absent ⇒ no
   *  topping engine: every line prices as a plain DB modifier. */
  pizzaConfigRaw: unknown;
  /** Resolved variant NAME (variantToppingPrices is keyed by name). */
  variantName: string | null;
  /** The child's stored modifier lines (client-supplied, untrusted). */
  rawModifiers: Array<{ modifierOptionId?: unknown; name?: unknown }>;
  /** The item's own + category modifier groups, from the DB. */
  candidateGroups: ComboChildGroup[];
};

export type PricedComboPizzaChild = {
  /** Validated lines with DISPLAY priceAdjustment (0 = included/covered). */
  validatedMods: Array<{ modifierOptionId: string; name: string; priceAdjustment: number }>;
  /** The money this child adds to the combo (already extrasCharge-gated). */
  extrasFee: number;
  /** Pool half-units this child consumed (0 in per-pizza mode). */
  toppingHalfUnitsUsed: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
// Matches the STANDALONE pizza cap (route.ts), not the non-pizza child cap of
// 60 — a big pizza honestly reaches >60 lines (count ×10 per topping), and a
// lower cap here would silently drop charged lines the composer previews.
const MAX_MODS = 120;

type ParsedEngine = {
  cfg: ToppingPricingConfig;
  toppingGroupKeys: Set<string>;
  halfMult: number;
};

/** Mirror of the standalone path's engine construction (route.ts :1194-1213). */
function parseEngine(pizzaConfigRaw: unknown, variantName: string | null): ParsedEngine | null {
  if (typeof pizzaConfigRaw !== "string" || !pizzaConfigRaw.trim()) return null;
  try {
    const pc = JSON.parse(pizzaConfigRaw);
    if (!pc || typeof pc !== "object") return null;
    const halfMult = typeof pc.halfToppingMultiplier === "number"
      ? Math.max(0, Math.min(1, pc.halfToppingMultiplier))
      : 0.5;
    const toppingGroupKeys = new Set<string>();
    for (const id of Array.isArray(pc.toppingGroupIds) ? pc.toppingGroupIds : []) {
      toppingGroupKeys.add(String(id));
    }
    const byVariant = pc.variantToppingPrices && typeof pc.variantToppingPrices === "object"
      ? pc.variantToppingPrices : null;
    const overridden = byVariant && variantName != null ? byVariant[variantName] : undefined;
    return {
      cfg: {
        extraToppingPrice: Number(overridden !== undefined ? overridden : pc.extraToppingPrice) || 0,
        includedToppings: Number(pc.includedToppings) || 0,
        halfToppingMultiplier: halfMult,
        reduceOnRemove: pc.reduceOnRemove !== false,
      },
      toppingGroupKeys,
      halfMult,
    };
  } catch {
    return null;
  }
}

export function priceComboPizzaChildren(input: {
  children: ComboPizzaChildInput[];
  extrasCharge: boolean;
  /** >= 1 switches every child in this call to POOL mode. */
  sharedToppings?: number;
  /** Display-name sanitizer (the route passes its own; default trims to 200). */
  sanitizeName?: (s: string) => string;
}): PricedComboPizzaChild[] {
  const { children, extrasCharge } = input;
  const clean = input.sanitizeName ?? ((s: string) => s.trim().slice(0, 200));
  const poolOn = Math.floor(Number(input.sharedToppings) || 0) >= 1;

  type Walked = {
    engine: ParsedEngine | null;
    validatedMods: Array<{ modifierOptionId: string; name: string; priceAdjustment: number }>;
    toppingLines: ToppingChargeLine[];
    /** validatedMods index for each topping line (charges assigned after). */
    toppingModIndexes: number[];
    nonToppingSum: number;
  };

  const walked: Walked[] = children.map((child) => {
    const engine = parseEngine(child.pizzaConfigRaw, child.variantName);
    const validatedMods: Walked["validatedMods"] = [];
    const toppingLines: ToppingChargeLine[] = [];
    const toppingModIndexes: number[] = [];
    let nonToppingSum = 0;

    for (const rm of (Array.isArray(child.rawModifiers) ? child.rawModifiers : []).slice(0, MAX_MODS)) {
      const optId = typeof rm?.modifierOptionId === "string" ? rm.modifierOptionId : null;
      if (!optId) continue; // no id → cannot validate → drop
      let opt: ComboChildGroup["options"][number] | null = null;
      let group: ComboChildGroup | null = null;
      for (const g of child.candidateGroups) {
        const o = g.options.find((x) => x.id === optId);
        if (o) { opt = o; group = g; break; }
      }
      if (!opt || !group) continue; // unknown option → drop (never trusted)

      const clientName = typeof rm.name === "string" ? clean(rm.name) : "";
      const name = clientName || opt.name;
      const isTopping =
        engine !== null &&
        (engine.toppingGroupKeys.has(group.id) ||
          (!!group.libraryGroupId && engine.toppingGroupKeys.has(group.libraryGroupId)));

      if (isTopping) {
        toppingLines.push({ optionId: opt.id, optionPrice: opt.priceAdjustment, isHalf: isHalfToppingName(name) });
        toppingModIndexes.push(validatedMods.length);
        validatedMods.push({ modifierOptionId: opt.id, name, priceAdjustment: 0 }); // charge assigned below
      } else {
        // (L.H)/(R.H) sauce & cheese lines are halved like the standalone path.
        const halfMult = engine?.halfMult ?? 1;
        const priced = isHalfToppingName(name)
          ? round2(opt.priceAdjustment * halfMult)
          : opt.priceAdjustment;
        nonToppingSum += priced;
        validatedMods.push({ modifierOptionId: opt.id, name, priceAdjustment: priced });
      }
    }
    return { engine, validatedMods, toppingLines, toppingModIndexes, nonToppingSum };
  });

  if (poolOn) {
    // ONE pool walk across every child, in child order (the determinism
    // contract — bundleItems order on both sides).
    const alloc = allocateToppingPool(
      Math.floor(Number(input.sharedToppings) || 0),
      walked.map((w) => ({
        cfg: w.engine?.cfg ?? { extraToppingPrice: 0, includedToppings: 0, halfToppingMultiplier: 0.5 },
        lines: w.toppingLines,
      })),
    );
    return walked.map((w, i) => {
      const res = alloc.children[i];
      res.lineCharges.forEach((charge, li) => {
        w.validatedMods[w.toppingModIndexes[li]].priceAdjustment = charge; // money == display in pool mode
      });
      // Pool overage always charges; extrasCharge gates only non-topping extras.
      // NO toppingBaseAdjust here — the pool replaced the allowance.
      // When extras aren't charged, non-topping lines were FREE — zero their
      // display price so receipts never print money that wasn't collected.
      if (!extrasCharge) {
        w.validatedMods.forEach((m, mi) => {
          if (!w.toppingModIndexes.includes(mi)) m.priceAdjustment = 0;
        });
      }
      const extrasFee = Math.max(0, round2((extrasCharge ? w.nonToppingSum : 0) + res.toppingTotal));
      return { validatedMods: w.validatedMods, extrasFee, toppingHalfUnitsUsed: res.halfUnitsUsed };
    });
  }

  // PER-PIZZA mode — the standalone-pizza pattern, per child.
  return walked.map((w) => {
    let toppingMoney = 0;
    if (w.engine && w.toppingLines.length > 0) {
      const charges = priceToppingLines(w.engine.cfg, w.toppingLines);
      const display = priceToppingLinesForDisplay(w.engine.cfg, w.toppingLines);
      charges.forEach((charge, li) => {
        w.validatedMods[w.toppingModIndexes[li]].priceAdjustment = display[li];
        toppingMoney += charge;
      });
    }
    // Base credit applies even at zero topping lines (a stripped preset pizza
    // falls to its base) — mirrors route.ts :1285 and computePrice.
    if (w.engine) toppingMoney += toppingBaseAdjust(w.engine.cfg);
    const extrasFee = extrasCharge ? Math.max(0, round2(w.nonToppingSum + toppingMoney)) : 0;
    // Free-extras combo → every line's display price is 0 (nothing collected).
    if (!extrasCharge) w.validatedMods.forEach((m) => { m.priceAdjustment = 0; });
    return { validatedMods: w.validatedMods, extrasFee, toppingHalfUnitsUsed: 0 };
  });
}
