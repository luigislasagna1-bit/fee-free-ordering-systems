"use client";
/**
 * PizzaBuilder — Enterprise-grade pizza customization component.
 *
 * Architecture:
 * • Reads a `pizzaConfig` JSON blob from a MenuItem to understand which
 *   modifier groups are crust / sauce / cheese / toppings.
 * • Supports whole-pizza, left-half, and right-half topping placement.
 * • Supports Extra / Normal / Light per-topping quantity modifiers.
 * • Live SVG pizza visual updates as selections change.
 * • Deterministic pricing engine (no rounding drift).
 * • Serialises the customisation into OrderItemModifier names so kitchen
 *   tickets print correctly without any additional schema.
 *
 * Multi-tenancy: all data (groups, options, prices) comes from the
 * restaurant's own menu items — no cross-restaurant data leaks possible.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  X, Plus, Minus, ChevronLeft, ChevronRight,
  Scissors, Check, Flame, Leaf, AlertCircle,
} from "lucide-react";
import { useCurrencyFormat } from "@/lib/currency-context";
import { useTranslations } from "next-intl";
import { priceToppingLines, type ToppingChargeLine } from "@/lib/pizza-topping-pricing";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToppingPlacement = "whole" | "left" | "right";
export type ToppingQuantity  = "light" | "normal";

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
  /** How many toppings are included in the base price (0 = all toppings charged individually via option.priceAdjustment) */
  includedToppings: number;
  /** When true, topping selection is OPTIONAL (customer may pick 0 — e.g. plain
   *  cheese). Overrides any topping group's "required" flag in the builder. */
  toppingsOptional?: boolean;
  /** Price per topping when includedToppings > 0; ignored when 0 (uses option prices) */
  extraToppingPrice: number;
  /** Per-variant topping prices keyed by variant name (overrides extraToppingPrice when a size is selected) */
  variantToppingPrices?: Record<string, number>;
  /** Multiplier applied to half-pizza toppings (default 0.5 → 50%) */
  halfToppingMultiplier: number;
  /** Additional price multiplier for "Extra" quantity on top of base topping price (default 0 = no upcharge) */
  extraQuantityMultiplier: number;
  /** Allow a customer to add MULTIPLE of the same topping (double pepperoni etc.),
   *  each counted as a separate topping. When false, a topping is just on/off.
   *  Default true. Luigi 2026-06-27. */
  allowMultipleToppings?: boolean;
  /**
   * Customer-facing section display order. Each entry is either a
   * synthetic id ("section:size", "section:halfHalfToggle") or the
   * libraryGroupId / id of a modifier group attached to the item.
   * When undefined or empty the legacy hardcoded order is used, so
   * existing items render unchanged. Owners drag-reorder the list in
   * the admin Pizza tab; saved here.
   */
  sectionOrder?: string[];
  /**
   * Which pizza-roles expose the Whole/Split half-pizza UI. Roles not
   * in this list render as a simple option grid (whole pizza only).
   * Defaults to ["sauce", "cheese", "toppings"] when undefined —
   * matches the legacy behaviour where all three roles supported
   * half/half. Owners disable a role here when their menu doesn't
   * actually let customers split that choice across halves (e.g.
   * cheese is always whole-pizza for their kitchen).
   */
  halfHalfRoles?: Array<"sauce" | "cheese" | "toppings">;
}

export interface SelectedTopping {
  optionId: string;
  name: string;
  groupId: string;
  placement: ToppingPlacement;
  quantity: ToppingQuantity;
  /** How many of this topping (double pepperoni = 2). Each unit counts as a
   *  separate topping for pricing / included-topping credits. Defaults to 1 when
   *  absent (older carts). Gated by allowMultipleToppings. Luigi 2026-06-27. */
  count?: number;
  /** Base unit price for one Normal whole topping */
  unitPrice: number;
}

export interface PizzaCustomization {
  isHalfHalf: boolean;
  crustOptionId: string | null;
  sauceOptionId: string | null;
  leftSauceOptionId: string | null;
  rightSauceOptionId: string | null;
  cheeseOptionId: string | null;
  leftCheeseOptionId: string | null;
  rightCheeseOptionId: string | null;
  toppings: SelectedTopping[];
  // Selections from modifier groups attached to the pizza item that don't
  // play a pizza-specific role (crust/sauce/cheese/topping). Cook level,
  // allergen flags, etc. Keyed by group id → array of selected option ids.
  otherSelections: Record<string, string[]>;
}

export interface PizzaAddResult {
  variantId: string | null;
  variant: { id: string; name: string; price: number } | null;
  quantity: number;
  notes: string;
  lineTotal: number;
  customization: PizzaCustomization;
}

interface ModOption {
  id: string; name: string; priceAdjustment: number;
  isDefault: boolean; isAvailable: boolean;
}
interface ModGroup {
  id: string; name: string; description?: string;
  required: boolean; minSelect: number; maxSelect: number;
  libraryGroupId?: string | null;
  /** Per-group half/half eligibility (per the modifier-group library
   *  toggle). When undefined we fall through to the legacy
   *  pizzaConfig.halfHalfRoles check for the sauce/cheese/toppings
   *  roles via groupSupportsHalfHalf(). */
  supportsHalfHalf?: boolean;
  options: ModOption[];
}
interface ItemVariant { id: string; name: string; price: number; isDefault: boolean }
interface MenuItem {
  id: string; name: string; description?: string; price: number;
  imageUrl?: string; hasVariants: boolean;
  variants: ItemVariant[]; modifierGroups: ModGroup[];
}

// ── Utility: parse & validate PizzaConfig from JSON string ───────────────────

export function parsePizzaConfig(json: string | null | undefined): PizzaConfig | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json);
    if (!c?.isPizza) return null;
    return {
      isPizza: true,
      allowHalfHalf:          c.allowHalfHalf          ?? true,
      crustGroupId:           c.crustGroupId            ?? undefined,
      sauceGroupId:           c.sauceGroupId            ?? undefined,
      cheeseGroupId:          c.cheeseGroupId           ?? undefined,
      toppingGroupIds:        Array.isArray(c.toppingGroupIds) ? c.toppingGroupIds : [],
      includedToppings:       Number(c.includedToppings)      || 0,
      toppingsOptional:       c.toppingsOptional === true,
      extraToppingPrice:      Number(c.extraToppingPrice)     || 0,
      variantToppingPrices:   c.variantToppingPrices && typeof c.variantToppingPrices === "object"
                                ? Object.fromEntries(
                                    Object.entries(c.variantToppingPrices).map(([k, v]) => [k, Number(v) || 0])
                                  )
                                : undefined,
      halfToppingMultiplier:  Number(c.halfToppingMultiplier) || 0.5,
      extraQuantityMultiplier:Number(c.extraQuantityMultiplier)|| 0,
      allowMultipleToppings:  c.allowMultipleToppings !== false, // default ON
      sectionOrder:           Array.isArray(c.sectionOrder)
                                ? c.sectionOrder.filter((x: unknown): x is string => typeof x === "string")
                                : undefined,
      halfHalfRoles:          Array.isArray(c.halfHalfRoles)
                                ? c.halfHalfRoles.filter((r: unknown): r is "sauce" | "cheese" | "toppings" =>
                                    r === "sauce" || r === "cheese" || r === "toppings",
                                  )
                                : undefined,
    };
  } catch { return null; }
}

/** Synthetic section IDs used in pizzaConfig.sectionOrder for things
 *  that aren't a single modifier group (size picker, half/half toggle,
 *  and the combined toppings section which holds multiple topping
 *  groups in one block). */
export const SECTION_SIZE = "section:size";
export const SECTION_HALF_HALF = "section:halfHalfToggle";
export const SECTION_TOPPINGS = "section:toppings";

/** Returns the canonical ID a modifier group should be addressed by in
 *  pizzaConfig.sectionOrder. Prefers libraryGroupId (stable across
 *  re-imports) and falls back to the instance id. */
export function sectionIdForGroup(group: { id: string; libraryGroupId?: string | null }): string {
  return group.libraryGroupId ?? group.id;
}

/** True if the configured role is currently allowed to render the
 *  Whole/Split half-pizza UI. */
export function roleSupportsHalfHalf(
  config: PizzaConfig,
  role: "sauce" | "cheese" | "toppings",
): boolean {
  // Legacy items (no halfHalfRoles set) — fall through to the old
  // default where every role supported half/half.
  if (!config.halfHalfRoles) return true;
  return config.halfHalfRoles.includes(role);
}

/**
 * Group-level eligibility for the Whole/Split UI. The source of truth is
 * the modifier-group flag (supportsHalfHalf, added 2026-05-31 per Luigi
 * — "set it on the group, not the item"). Falls back to the legacy
 * per-pizza-item halfHalfRoles check when the group flag is false so
 * existing items with sauce/cheese/toppings configured before the
 * flag landed don't regress to "no half/half."
 */
export function groupSupportsHalfHalf(
  group: { supportsHalfHalf?: boolean } | undefined,
  config: PizzaConfig,
  role: "sauce" | "cheese" | "toppings" | null,
): boolean {
  if (group?.supportsHalfHalf) return true;
  if (role) return roleSupportsHalfHalf(config, role);
  return false;
}

// ── Pricing engine ────────────────────────────────────────────────────────────

export function computePrice(
  customization: PizzaCustomization,
  variantId: string | null,
  item: MenuItem,
  groups: ModGroup[],
  config: PizzaConfig,
): number {
  // 1 Base price
  let price = item.hasVariants && variantId
    ? (item.variants.find(v => v.id === variantId)?.price ?? 0)
    : item.price;

  const findOpt = (groupId: string | undefined, optId: string | null) => {
    if (!groupId || !optId) return null;
    const grp = groups.find(g => g.id === groupId || g.libraryGroupId === groupId);
    return grp?.options.find(o => o.id === optId) ?? null;
  };

  // 2 Crust
  price += findOpt(config.crustGroupId, customization.crustOptionId)?.priceAdjustment ?? 0;

  // A sauce/cheese choice applied to ONE half costs the half-multiplier of its
  // whole-pizza price (e.g. Extra Cheese $1.49 on the left half = $0.745). Both
  // halves chosen = full price. Mirrors the topping half-pricing below + the
  // server's (L.H)/(R.H) halving. Luigi 2026-06-27.
  const half = config.halfToppingMultiplier;

  // 3 Sauce(s) — mirror pizzaCustomizationToModifiers EXACTLY: only the lines
  // that get SERIALISED are charged, so preview must add the same set. When
  // split with a half chosen, the two half lines are sent (whole is NOT) — so
  // the whole sauceOptionId price must NOT be added on top, or preview reads
  // higher than the charge (defaultCustomization seeds a paid default sauce
  // that lingers after switching to Split). Red-team fix 2026-07-06.
  if (customization.isHalfHalf && (customization.leftSauceOptionId || customization.rightSauceOptionId)) {
    price += (findOpt(config.sauceGroupId, customization.leftSauceOptionId)?.priceAdjustment ?? 0) * half;
    price += (findOpt(config.sauceGroupId, customization.rightSauceOptionId)?.priceAdjustment ?? 0) * half;
  } else {
    price += findOpt(config.sauceGroupId, customization.sauceOptionId)?.priceAdjustment ?? 0;
  }

  // 4 Cheese(s) — same mirror as sauce above.
  if (customization.isHalfHalf && (customization.leftCheeseOptionId || customization.rightCheeseOptionId)) {
    price += (findOpt(config.cheeseGroupId, customization.leftCheeseOptionId)?.priceAdjustment ?? 0) * half;
    price += (findOpt(config.cheeseGroupId, customization.rightCheeseOptionId)?.priceAdjustment ?? 0) * half;
  } else {
    price += findOpt(config.cheeseGroupId, customization.cheeseOptionId)?.priceAdjustment ?? 0;
  }

  // 5 Toppings — priced by the SHARED engine (src/lib/pizza-topping-pricing.ts),
  // the exact function the orders route charges with, so the on-screen price
  // and the real charge can never disagree (Luigi 2026-07-05; previously the
  // server re-priced every topping from option.priceAdjustment and ignored
  // Included Toppings / Price per Extra Topping entirely). Full semantics —
  // half-unit credits, whole-supersedes-half dedupe, light = free — live in
  // that module. Lines are per UNIT (double pepperoni = two lines), matching
  // how pizzaCustomizationToModifiers serialises for the kitchen + server.
  const toppingGroups = groups.filter(g =>
    config.toppingGroupIds.includes(g.id) || (g.libraryGroupId && config.toppingGroupIds.includes(g.libraryGroupId)),
  );
  const { toppings } = customization;
  const toppingLines: ToppingChargeLine[] = [];
  for (const t of toppings) {
    const grp = toppingGroups.find(g => g.id === t.groupId);
    const opt = grp?.options.find(o => o.id === t.optionId);
    const units = Math.max(1, t.count ?? 1); // double pepperoni = 2 units
    for (let i = 0; i < units; i++) {
      toppingLines.push({
        optionId: t.optionId,
        optionPrice: opt?.priceAdjustment ?? 0,
        isHalf: t.placement !== "whole",
        isLight: t.quantity === "light",
      });
    }
  }
  price += priceToppingLines(
    {
      extraToppingPrice: config.extraToppingPrice,
      includedToppings: config.includedToppings,
      halfToppingMultiplier: config.halfToppingMultiplier,
    },
    toppingLines,
  ).reduce((s, c) => s + c, 0);

  // 6 Other (non-role) modifier groups — flat priceAdjustment per selected option
  for (const [groupId, optionIds] of Object.entries(customization.otherSelections)) {
    const grp = groups.find(g => g.id === groupId);
    if (!grp) continue;
    for (const optId of optionIds) {
      const opt = grp.options.find(o => o.id === optId);
      if (opt) price += opt.priceAdjustment;
    }
  }

  // Round to 2 dp without fp drift
  return Math.round(price * 100) / 100;
}

// ── Serialise PizzaCustomization → OrderItemModifier array ───────────────────
// Kitchen tickets read these modifier names, so keep them descriptive.

export function pizzaCustomizationToModifiers(
  customization: PizzaCustomization,
  groups: ModGroup[],
): { modifierOptionId: string; name: string; priceAdjustment: number }[] {
  const out: { modifierOptionId: string; name: string; priceAdjustment: number }[] = [];
  const findOpt = (groupId: string | undefined, optId: string | null) =>
    groupId && optId
      ? groups.find(g => g.id === groupId || g.libraryGroupId === groupId)?.options.find(o => o.id === optId) ?? null
      : null;

  // Half/half side codes — prefixed to each modifier so kitchen staff can
  // immediately see where each item belongs. Crust never gets a code (it's
  // always applied to the whole pizza). When the pizza is NOT half/half,
  // no prefix is added since everything is whole by definition.
  const wholePrefix = customization.isHalfHalf ? "(W) " : "";
  const leftPrefix  = "(L.H) ";
  const rightPrefix = "(R.H) ";

  // Crust — no prefix, no role label
  if (customization.crustOptionId) {
    const g = groups.find(g => g.options.some(o => o.id === customization.crustOptionId));
    const o = g?.options.find(o => o.id === customization.crustOptionId);
    if (o) out.push({ modifierOptionId: o.id, name: o.name, priceAdjustment: o.priceAdjustment });
  }

  // Other (non-role) modifier groups — cook level, allergen flags, etc.
  // Apply to the whole pizza by convention, so no half/half prefix.
  for (const [groupId, optionIds] of Object.entries(customization.otherSelections)) {
    const grp = groups.find(g => g.id === groupId);
    if (!grp) continue;
    for (const optId of optionIds) {
      const o = grp.options.find(opt => opt.id === optId);
      if (o) out.push({ modifierOptionId: o.id, name: o.name, priceAdjustment: o.priceAdjustment });
    }
  }

  // Sauce / cheese — half/half codes only when applicable
  const addSauceOrCheese = (optId: string | null, prefix: string) => {
    if (!optId) return;
    const g = groups.find(g => g.options.some(o => o.id === optId));
    const o = g?.options.find(o => o.id === optId);
    if (o) out.push({ modifierOptionId: o.id, name: `${prefix}${o.name}`, priceAdjustment: o.priceAdjustment });
  };

  if (customization.isHalfHalf && (customization.leftSauceOptionId || customization.rightSauceOptionId)) {
    addSauceOrCheese(customization.leftSauceOptionId, leftPrefix);
    addSauceOrCheese(customization.rightSauceOptionId, rightPrefix);
  } else {
    addSauceOrCheese(customization.sauceOptionId, wholePrefix);
  }

  if (customization.isHalfHalf && (customization.leftCheeseOptionId || customization.rightCheeseOptionId)) {
    addSauceOrCheese(customization.leftCheeseOptionId, leftPrefix);
    addSauceOrCheese(customization.rightCheeseOptionId, rightPrefix);
  } else {
    addSauceOrCheese(customization.cheeseOptionId, wholePrefix);
  }

  // Toppings. A topping with count N is emitted as N separate modifier lines so
  // the kitchen sees the quantity AND the server charges N× (it re-prices each
  // line from the DB option + halves (L.H)/(R.H) lines). Luigi 2026-06-27.
  for (const t of customization.toppings) {
    const grp = groups.find(g => g.id === t.groupId);
    const opt = grp?.options.find(o => o.id === t.optionId);
    if (!opt) continue;

    const prefix =
      t.placement === "left"  ? leftPrefix  :
      t.placement === "right" ? rightPrefix :
      wholePrefix;
    const quantity = t.quantity === "light" ? ", Light" : "";
    const units = Math.max(1, t.count ?? 1);
    for (let i = 0; i < units; i++) {
      out.push({
        modifierOptionId: opt.id,
        name: `${prefix}${opt.name}${quantity}`,
        priceAdjustment: opt.priceAdjustment,
      });
    }
  }

  return out;
}

// ── SVG Pizza Visual ──────────────────────────────────────────────────────────

// Pre-computed topping slot positions (viewBox 0 0 200 200, pizza radius 82)
const WHOLE_SLOTS: [number, number][] = [
  [100, 100], [80, 75],  [120, 75],  [130, 105], [115, 130],
  [85, 130],  [70, 105], [60, 80],   [100, 55],  [140, 80],
  [148, 112], [130, 148],[100, 158], [70, 148],  [52, 112],
];
const LEFT_SLOTS: [number, number][] = [
  [72, 88],  [58, 105], [68, 124], [85, 65],   [78, 140],
  [48, 90],  [55, 130], [88, 112], [65, 78],   [52, 115],
];
const RIGHT_SLOTS: [number, number][] = [
  [128, 88], [142, 105],[132, 124],[115, 65],  [122, 140],
  [152, 90], [145, 130],[112, 112],[135, 78],  [148, 115],
];

const TOPPING_PALETTE = [
  "#c0392b", "#8B4513", "#27ae60", "#f39c12", "#1a252f",
  "#d81b60", "#e65100", "#795548", "#6a1b9a", "#00838f",
];

function toppingColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) & 0x7fffffff;
  return TOPPING_PALETTE[h % TOPPING_PALETTE.length];
}

function PizzaVisual({
  isHalfHalf, toppings,
}: { isHalfHalf: boolean; toppings: SelectedTopping[] }) {
  const tp = useTranslations("pizza");
  const whole = toppings.filter(t => t.placement === "whole");
  const left  = toppings.filter(t => t.placement === "left");
  const right = toppings.filter(t => t.placement === "right");

  return (
    <svg viewBox="0 0 200 200" className="w-full drop-shadow-lg select-none" aria-hidden="true">
      <defs>
        <radialGradient id="crustGrad" cx="50%" cy="45%" r="55%">
          <stop offset="0%"   stopColor="#e8c06a" />
          <stop offset="100%" stopColor="#c4873a" />
        </radialGradient>
        <radialGradient id="pizzaGrad" cx="50%" cy="45%" r="55%">
          <stop offset="0%"   stopColor="#f5d17b" />
          <stop offset="100%" stopColor="#e8b860" />
        </radialGradient>
        <radialGradient id="sauceGrad" cx="50%" cy="45%" r="55%">
          <stop offset="0%"   stopColor="#e53935" />
          <stop offset="100%" stopColor="#b71c1c" />
        </radialGradient>
        <radialGradient id="cheeseGrad" cx="50%" cy="45%" r="55%">
          <stop offset="0%"   stopColor="#fff8e1" />
          <stop offset="100%" stopColor="#ffe082" />
        </radialGradient>
        <radialGradient id="gloss" cx="40%" cy="35%" r="55%">
          <stop offset="0%"   stopColor="white" stopOpacity="0.18" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>
        <clipPath id="leftHalf">
          <rect x="0" y="0" width="100" height="200" />
        </clipPath>
        <clipPath id="rightHalf">
          <rect x="100" y="0" width="100" height="200" />
        </clipPath>
      </defs>

      {/* Crust */}
      <circle cx="100" cy="100" r="92" fill="url(#crustGrad)" />

      {/* Pizza base */}
      <circle cx="100" cy="100" r="82" fill="url(#pizzaGrad)" />

      {/* Sauce */}
      <circle cx="100" cy="100" r="76" fill="url(#sauceGrad)" opacity="0.85" />

      {/* Cheese */}
      <circle cx="100" cy="100" r="72" fill="url(#cheeseGrad)" opacity="0.75" />

      {/* Half/half divider */}
      {isHalfHalf && (
        <>
          <line
            x1="100" y1="18" x2="100" y2="182"
            stroke="rgba(255,255,255,0.7)" strokeWidth="2"
            strokeDasharray="4 3"
          />
          <text x="62" y="104" textAnchor="middle" fontSize="8" fontWeight="700"
            fill="rgba(255,255,255,0.9)" style={{ userSelect: "none" }}>{tp("leftSvg")}</text>
          <text x="138" y="104" textAnchor="middle" fontSize="8" fontWeight="700"
            fill="rgba(255,255,255,0.9)" style={{ userSelect: "none" }}>{tp("rightSvg")}</text>
        </>
      )}

      {/* Whole toppings */}
      {whole.map((t, i) => {
        const [cx, cy] = WHOLE_SLOTS[i % WHOLE_SLOTS.length];
        const col = toppingColor(t.name);
        return (
          <g key={`w-${t.optionId}-${i}`}>
            <circle cx={cx} cy={cy} r={(t.count ?? 1) > 1 ? 8 : 6.5} fill={col} opacity="0.92" />
            {(t.count ?? 1) > 1 && (
              <circle cx={cx + 6} cy={cy - 6} r={4} fill={col} opacity="0.75" />
            )}
          </g>
        );
      })}

      {/* Left half toppings */}
      {left.map((t, i) => {
        const [cx, cy] = LEFT_SLOTS[i % LEFT_SLOTS.length];
        return (
          <circle key={`l-${t.optionId}-${i}`}
            cx={cx} cy={cy} r="6.5" fill={toppingColor(t.name)} opacity="0.92" />
        );
      })}

      {/* Right half toppings */}
      {right.map((t, i) => {
        const [cx, cy] = RIGHT_SLOTS[i % RIGHT_SLOTS.length];
        return (
          <circle key={`r-${t.optionId}-${i}`}
            cx={cx} cy={cy} r="6.5" fill={toppingColor(t.name)} opacity="0.92" />
        );
      })}

      {/* Gloss sheen */}
      <circle cx="100" cy="100" r="82" fill="url(#gloss)" />
    </svg>
  );
}

// ── Topping pill ──────────────────────────────────────────────────────────────

function ToppingPill({
  opt, topping, onToggle, onSetQuantity, onSetCount, allowMultiple = false, primaryColor, priceMultiplier = 1,
}: {
  opt: ModOption;
  topping: SelectedTopping | undefined;
  onToggle: () => void;
  onSetQuantity: (qty: ToppingQuantity) => void;
  /** Adjust the quantity of this topping by delta (+1 / −1). */
  onSetCount?: (delta: number) => void;
  /** Whether the restaurant allows multiples of the same topping. */
  allowMultiple?: boolean;
  primaryColor: string;
  /** Half-pizza display multiplier (0.5) so a topping added on the current half
   *  shows the price it'll actually cost. 1 = whole. */
  priceMultiplier?: number;
}) {
  const formatCurrency = useCurrencyFormat();
  const selected = !!topping;
  const qty = topping?.quantity ?? "normal";
  const count = topping?.count ?? 1;
  // Show the line price for the chosen quantity (× count); light is free.
  const shownPrice = qty === "light" ? 0 : Math.round(opt.priceAdjustment * priceMultiplier * count * 100) / 100;

  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border-2 transition-all text-sm ${
        selected ? "shadow-sm" : "border-gray-100 bg-white hover:border-gray-300"
      }`}
      style={selected ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10` } : {}}
    >
      <button
        className="flex items-center gap-2 flex-1 text-left min-w-0"
        onClick={onToggle}
      >
        <span
          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            selected ? "" : "border-gray-300"
          }`}
          style={selected ? { borderColor: primaryColor, backgroundColor: primaryColor } : {}}
        >
          {selected && <Check className="w-3 h-3 text-white" />}
        </span>
        <span className={`font-medium truncate ${selected ? "text-gray-900" : "text-gray-700"}`}>
          {opt.name}
        </span>
        {shownPrice > 0 && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            +{formatCurrency(shownPrice)}
          </span>
        )}
      </button>

      {selected && (
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <QtyButton
            label="Light"
            active={qty === "light"}
            activeColor="#0284c7"
            onClick={(e) => { e.stopPropagation(); onSetQuantity("light"); }}
          />
          {/* Multiple-of-the-same-topping stepper (double pepperoni etc.). Only
              when the restaurant allows it + the topping isn't "Light". */}
          {allowMultiple && qty !== "light" && (
            <div className="flex items-center gap-1">
              <button
                type="button" aria-label="Less"
                onClick={(e) => { e.stopPropagation(); onSetCount?.(-1); }}
                disabled={count <= 1}
                className="w-7 h-7 rounded-lg border-2 border-gray-200 bg-white text-gray-600 flex items-center justify-center hover:border-gray-400 disabled:opacity-40"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-5 text-center font-bold text-gray-800 text-sm tabular-nums">{count}</span>
              <button
                type="button" aria-label="More"
                onClick={(e) => { e.stopPropagation(); onSetCount?.(1); }}
                className="w-7 h-7 rounded-lg border-2 flex items-center justify-center text-white"
                style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QtyButton({
  label, active, activeColor, onClick,
}: {
  label: string;
  active: boolean;
  activeColor: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-bold px-2.5 py-1 rounded-lg border-2 transition ${
        active
          ? "text-white"
          : "text-gray-500 border-gray-200 bg-white hover:border-gray-400 hover:text-gray-700"
      }`}
      style={active ? { backgroundColor: activeColor, borderColor: activeColor } : {}}
    >
      {label}
    </button>
  );
}

// ── Placement selector pill ───────────────────────────────────────────────────

function PlacementButton({
  label, active, onClick, primaryColor,
}: { label: string; active: boolean; onClick: () => void; primaryColor: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition"
      style={
        active
          ? { backgroundColor: primaryColor, color: "#fff" }
          : { backgroundColor: "#f3f4f6", color: "#6b7280" }
      }
    >
      {label}
    </button>
  );
}

// ── Main PizzaBuilder ─────────────────────────────────────────────────────────

interface PizzaBuilderProps {
  item: MenuItem;
  config: PizzaConfig;
  primaryColor: string;
  onClose: () => void;
  onAdd: (result: PizzaAddResult) => void;
  // When present (re-editing an existing cart entry), seeds the builder state
  // instead of using defaultCustomization().
  initial?: {
    variantId: string | null;
    customization: PizzaCustomization;
    quantity: number;
    notes: string;
  };
}

// Default customization state
function defaultCustomization(item: MenuItem, config: PizzaConfig, groups: ModGroup[]): PizzaCustomization {
  const findDefault = (groupId?: string) =>
    groupId
      ? groups.find(g => g.id === groupId)?.options.find(o => o.isDefault && o.isAvailable)?.id ?? null
      : null;

  // Pre-fill defaults on any non-role groups attached to the item.
  const roleIds = new Set<string>();
  if (config.crustGroupId)  roleIds.add(config.crustGroupId);
  if (config.sauceGroupId)  roleIds.add(config.sauceGroupId);
  if (config.cheeseGroupId) roleIds.add(config.cheeseGroupId);
  for (const id of config.toppingGroupIds) roleIds.add(id);
  const otherSelections: Record<string, string[]> = {};
  for (const g of groups) {
    if (roleIds.has(g.id) || (g.libraryGroupId && roleIds.has(g.libraryGroupId))) continue;
    const preselected = g.options
      .filter(o => o.isDefault && o.isAvailable)
      .slice(0, Math.max(1, g.maxSelect))
      .map(o => o.id);
    if (preselected.length > 0) otherSelections[g.id] = preselected;
  }

  return {
    isHalfHalf: false,
    crustOptionId:       findDefault(config.crustGroupId),
    sauceOptionId:       findDefault(config.sauceGroupId),
    leftSauceOptionId:   null,
    rightSauceOptionId:  null,
    cheeseOptionId:      findDefault(config.cheeseGroupId),
    leftCheeseOptionId:  null,
    rightCheeseOptionId: null,
    toppings: [],
    otherSelections,
  };
}

export function PizzaBuilder({ item, config, primaryColor, onClose, onAdd, initial }: PizzaBuilderProps) {
  const tp = useTranslations("pizza");
  const tOrd = useTranslations("ordering");
  const formatCurrency = useCurrencyFormat();
  const groups = item.modifierGroups;

  // ── State ────────────────────────────────────────────────────────────────
  const [variantId, setVariantId] = useState<string | null>(
    initial?.variantId ?? (
      item.hasVariants
        ? (item.variants.find(v => v.isDefault)?.id ?? item.variants[0]?.id ?? null)
        : null
    )
  );
  const [customization, setCustomization] = useState<PizzaCustomization>(() =>
    initial?.customization ?? defaultCustomization(item, config, groups)
  );
  const [toppingPlacement, setToppingPlacement] = useState<ToppingPlacement>("whole");
  const [sauceMode, setSauceMode] = useState<"whole" | "split">(
    initial?.customization.isHalfHalf &&
    (initial.customization.leftSauceOptionId || initial.customization.rightSauceOptionId)
      ? "split"
      : "whole"
  );
  const [cheeseMode, setCheeseMode] = useState<"whole" | "split">(
    initial?.customization.isHalfHalf &&
    (initial.customization.leftCheeseOptionId || initial.customization.rightCheeseOptionId)
      ? "split"
      : "whole"
  );
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // Derived — match by id OR libraryGroupId (pizzaConfig stores library group IDs;
  // item.modifierGroups contains attached copies whose libraryGroupId points back to the source)
  const matchesGroup = (g: ModGroup, configId: string | undefined) =>
    !!configId && (g.id === configId || g.libraryGroupId === configId);
  const crustGroup    = groups.find(g => matchesGroup(g, config.crustGroupId));
  const sauceGroup    = groups.find(g => matchesGroup(g, config.sauceGroupId));
  const cheeseGroup   = groups.find(g => matchesGroup(g, config.cheeseGroupId));
  const toppingGroups = groups.filter(g =>
    config.toppingGroupIds.some(tid => g.id === tid || g.libraryGroupId === tid)
  );

  // Whether at least one topping group is half/half-eligible — controls
  // whether the toppings section shows the L/Whole/R placement bar AND
  // whether toggleTopping should honour the current tab (vs. always
  // storing as "whole"). Hoisted up here from below so toggleTopping
  // can close over it without hitting a TDZ error.
  const toppingsHaveHalfHalf =
    toppingGroups.some(g => g.supportsHalfHalf) ||
    roleSupportsHalfHalf(config, "toppings");

  // Any modifier group attached to the item that isn't playing a pizza role
  // (e.g. Cook Level). These render as their own sections under Crust.
  const usedGroupIds = new Set<string>();
  if (crustGroup)  usedGroupIds.add(crustGroup.id);
  if (sauceGroup)  usedGroupIds.add(sauceGroup.id);
  if (cheeseGroup) usedGroupIds.add(cheeseGroup.id);
  for (const g of toppingGroups) usedGroupIds.add(g.id);
  const otherGroups = groups.filter(g => !usedGroupIds.has(g.id));

  // ── Section ordering ─────────────────────────────────────────────────────
  // Each section gets a CSS `order` value computed from either the owner-
  // configured pizzaConfig.sectionOrder or the legacy default. Using CSS
  // flexbox `order` rather than reshuffling the JSX keeps the existing
  // section markup completely unchanged — the only DOM diff is that the
  // parent container now uses `flex flex-col gap-6` instead of
  // `space-y-6`. Items without an explicit sectionOrder render in the
  // historical order, byte-identical to before this refactor.
  const orderedSectionIds = useMemo<string[]>(() => {
    const def: string[] = [SECTION_SIZE];
    if (crustGroup) def.push(sectionIdForGroup(crustGroup));
    for (const g of otherGroups) def.push(sectionIdForGroup(g));
    // SECTION_HALF_HALF entry intentionally omitted — the master Half/Half
    // toggle was removed 2026-05-31 in favour of per-section Whole/Split
    // pickers driven by group.supportsHalfHalf. Legacy sectionOrder
    // arrays that still reference it just no-op since nothing renders.
    if (sauceGroup) def.push(sectionIdForGroup(sauceGroup));
    if (cheeseGroup) def.push(sectionIdForGroup(cheeseGroup));
    if (toppingGroups.length > 0) def.push(SECTION_TOPPINGS);
    if (!config.sectionOrder || config.sectionOrder.length === 0) return def;
    const inUser = new Set(config.sectionOrder);
    const tail = def.filter(id => !inUser.has(id));
    return [...config.sectionOrder, ...tail];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.sectionOrder, config.allowHalfHalf, crustGroup?.id, sauceGroup?.id, cheeseGroup?.id, toppingGroups.map(g => g.id).join(","), otherGroups.map(g => g.id).join(",")]);
  const sectionOrderMap = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    orderedSectionIds.forEach((id, i) => { m[id] = i; });
    return m;
  }, [orderedSectionIds]);
  const orderStyle = (id: string): React.CSSProperties => ({ order: sectionOrderMap[id] ?? 999 });

  // Resolve per-variant topping price — override config.extraToppingPrice for the selected size
  const effectiveConfig = useMemo((): PizzaConfig => {
    if (!config.variantToppingPrices || !variantId) return config;
    const variantName = item.variants.find(v => v.id === variantId)?.name;
    if (!variantName) return config;
    const price = config.variantToppingPrices[variantName];
    if (price === undefined) return config;
    return { ...config, extraToppingPrice: price };
  }, [config, variantId, item.variants]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unit price (for a single pizza at current customization)
  const unitPrice = useMemo(
    () => computePrice(customization, variantId, item, groups, effectiveConfig),
    [customization, variantId, effectiveConfig] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const lineTotal = Math.round(unitPrice * quantity * 100) / 100;

  // ── Crust handler ────────────────────────────────────────────────────────
  const setCrust = (optionId: string) =>
    setCustomization(c => ({ ...c, crustOptionId: optionId }));

  // ── Sauce handlers ───────────────────────────────────────────────────────
  const setSauce = (optId: string, side: "whole" | "left" | "right") =>
    setCustomization(c => ({
      ...c,
      sauceOptionId:      side === "whole" ? optId : c.sauceOptionId,
      leftSauceOptionId:  side === "left"  ? optId : c.leftSauceOptionId,
      rightSauceOptionId: side === "right" ? optId : c.rightSauceOptionId,
    }));

  // ── Cheese handlers ──────────────────────────────────────────────────────
  const setCheese = (optId: string, side: "whole" | "left" | "right") =>
    setCustomization(c => ({
      ...c,
      cheeseOptionId:      side === "whole" ? optId : c.cheeseOptionId,
      leftCheeseOptionId:  side === "left"  ? optId : c.leftCheeseOptionId,
      rightCheeseOptionId: side === "right" ? optId : c.rightCheeseOptionId,
    }));

  // ── Topping handlers ─────────────────────────────────────────────────────

  const toggleTopping = useCallback((opt: ModOption, groupId: string) => {
    setCustomization(c => {
      // Honor the explicit tab choice (Left Half / Whole / Right Half).
      // We DO NOT gate this on c.isHalfHalf because that flag is derived
      // from "do any toppings have a non-whole placement?" — which means
      // it's false until the FIRST half topping exists, creating a
      // chicken-and-egg: the first half-topping click would be silently
      // recorded as "whole" and the checkbox in the half tab wouldn't
      // tick because the topping is stored under the wrong placement
      // (Luigi 2026-06-01). The renderer already uses toppingsHaveHalfHalf
      // (capability flag — "are the L/W/R tabs even visible?"), so we
      // mirror that here: when the tabs are visible, trust the tab; when
      // not, force whole. toppingPlacement is initialised to "whole" and
      // only changes when the user clicks a half tab, so referencing it
      // directly gives the right answer in both modes.
      const placement = toppingsHaveHalfHalf ? toppingPlacement : "whole";
      const existing = c.toppings.findIndex(
        t => t.optionId === opt.id && t.placement === placement
      );
      if (existing >= 0) {
        // Remove
        return { ...c, toppings: c.toppings.filter((_, i) => i !== existing) };
      }
      // Add — but FIRST drop any placement-conflicting entries for the
      // same option so the topping list never holds logical duplicates.
      // Luigi 2026-06-01: clicking through Left → Right → Whole was
      // leaving three pepperoni records for the same item, so the
      // included-topping credit was getting fully spent on L+R and the
      // Whole stayed at full charge. The cleanup rules:
      //   • Adding "whole"          → remove any "left" or "right" of
      //                                the same option (Whole supersedes
      //                                both halves)
      //   • Adding "left" / "right" → remove any "whole" of the same
      //                                option (since a half is replacing
      //                                what was a whole)
      //   • L vs R for the same option stay both — that's a legitimate
      //     "pepperoni on both sides" state pricing-equivalent to Whole.
      let nextToppings = c.toppings;
      if (placement === "whole") {
        nextToppings = c.toppings.filter(t => t.optionId !== opt.id);
      } else {
        nextToppings = c.toppings.filter(
          t => !(t.optionId === opt.id && t.placement === "whole")
        );
      }
      const unitPrice = effectiveConfig.extraToppingPrice > 0
        ? effectiveConfig.extraToppingPrice
        : opt.priceAdjustment;
      return {
        ...c,
        toppings: [...nextToppings, {
          optionId: opt.id, name: opt.name, groupId,
          placement, quantity: "normal", count: 1, unitPrice,
        }],
      };
    });
  }, [toppingPlacement, effectiveConfig.extraToppingPrice, toppingsHaveHalfHalf]); // eslint-disable-line react-hooks/exhaustive-deps

  const setToppingQuantity = useCallback(
    (optionId: string, placement: ToppingPlacement, qty: ToppingQuantity) => {
      setCustomization(c => ({
        ...c,
        toppings: c.toppings.map(t => {
          if (t.optionId !== optionId || t.placement !== placement) return t;
          // Tapping the already-active quantity returns to normal. Switching to
          // Light resets the count to 1 (light double-topping is nonsensical).
          const next: ToppingQuantity = t.quantity === qty ? "normal" : qty;
          return { ...t, quantity: next, count: next === "light" ? 1 : t.count };
        }),
      }));
    },
    [],
  );

  // Adjust how many of a topping (double pepperoni etc.), clamped 1..MAX.
  const MAX_TOPPING_COUNT = 10;
  const setToppingCount = useCallback(
    (optionId: string, placement: ToppingPlacement, delta: number) => {
      setCustomization(c => ({
        ...c,
        toppings: c.toppings.map(t => {
          if (t.optionId !== optionId || t.placement !== placement) return t;
          const next = Math.max(1, Math.min(MAX_TOPPING_COUNT, (t.count ?? 1) + delta));
          return { ...t, count: next };
        }),
      }));
    },
    [],
  );

  // ── Half/half derivation ─────────────────────────────────────────────────
  // Per Luigi 2026-05-31 (and the per-group supportsHalfHalf flag): there's
  // no master Half/Half toggle anymore. Each half/half-eligible section
  // owns its own Whole/Split picker (or per-option L/R placement for
  // toppings) and we derive isHalfHalf from those per-section states for
  // anything that still needs a "is this a split pizza right now?" answer
  // (pizza visual + cart line summary + name prefixing). When the cart
  // round-trips a saved customization back to the editor, the per-section
  // state seeds itself from those legacy isHalfHalf-based fields so
  // re-editing existing cart entries still works.

  const toggleHalfHalf = () => {
    setCustomization(c => {
      if (c.isHalfHalf) {
        // Turning OFF: merge all toppings back to "whole", drop duplicates
        const seen = new Set<string>();
        const merged = c.toppings
          .filter(t => { const k = t.optionId; if (seen.has(k)) return false; seen.add(k); return true; })
          .map(t => ({ ...t, placement: "whole" as ToppingPlacement }));
        return { ...c, isHalfHalf: false, toppings: merged };
      }
      // Turning ON: convert all "whole" toppings to left half by default
      return {
        ...c,
        isHalfHalf: true,
        toppings: c.toppings.map(t => ({ ...t, placement: "left" as ToppingPlacement })),
      };
    });
    setToppingPlacement("whole");
  };

  /**
   * Derived "is this pizza currently configured as half/half?"
   * True if ANY section is in split mode OR ANY topping has L/R placement
   * OR (legacy) any left/right sauce/cheese is set.
   * Used by:
   *   - pizza visual on the right (renders L|R when true)
   *   - cart line summary / name prefixing
   *   - addToCart payload (so older order rendering keeps working)
   */
  const effectiveHalfHalf =
    sauceMode === "split" ||
    cheeseMode === "split" ||
    customization.toppings.some(t => t.placement !== "whole") ||
    !!customization.leftSauceOptionId || !!customization.rightSauceOptionId ||
    !!customization.leftCheeseOptionId || !!customization.rightCheeseOptionId;

  // Keep customization.isHalfHalf in sync with the derived value so the
  // cart payload and the legacy code paths that still read .isHalfHalf
  // see the right answer without further changes. We do this in a
  // dedicated effect so the state stays single-source.
  useEffect(() => {
    setCustomization(c => c.isHalfHalf === effectiveHalfHalf ? c : { ...c, isHalfHalf: effectiveHalfHalf });
  }, [effectiveHalfHalf]);

  // (toppingsHaveHalfHalf hoisted up near toppingGroups so the
  // toggleTopping useCallback can close over it without a TDZ error.)

  // ── Add to cart ──────────────────────────────────────────────────────────

  const handleAdd = () => {
    if (item.hasVariants && !variantId) return;

    const variant = variantId
      ? item.variants.find(v => v.id === variantId) ?? null
      : null;

    onAdd({
      variantId,
      variant: variant ? { id: variant.id, name: variant.name, price: variant.price } : null,
      quantity,
      notes,
      lineTotal,
      customization,
    });
  };

  // ── Other-group selection handler ────────────────────────────────────────
  const toggleOtherOption = (group: ModGroup, optionId: string) =>
    setCustomization(c => {
      const current = c.otherSelections[group.id] ?? [];
      const alreadySelected = current.includes(optionId);
      let next: string[];
      if (group.maxSelect <= 1) {
        // Single-select: clicking the same option deselects (only if not required)
        next = alreadySelected && !group.required ? [] : [optionId];
      } else if (alreadySelected) {
        next = current.filter(id => id !== optionId);
      } else {
        // Multi-select: respect maxSelect cap
        next = current.length < group.maxSelect ? [...current, optionId] : current;
      }
      return { ...c, otherSelections: { ...c.otherSelections, [group.id]: next } };
    });

  // ── Validation ───────────────────────────────────────────────────────────
  const crustMissing = !!(crustGroup?.required && !customization.crustOptionId);

  // Sauce / Cheese: the per-section sauceMode / cheeseMode state is the
  // source of truth for which selection counts. When the customer is in
  // "split" mode AND the group supports half/half, both halves must be
  // set; otherwise the single whole-pizza pick satisfies the group. The
  // old check ignored sauceMode and required left+right whenever the
  // master Half/Half toggle was on — so a customer who picked "Pizza
  // Sauce" in Whole mode still saw "Please choose sauce to continue."
  // Surfaced by Luigi 2026-05-31 on Build Your Own Pizza.
  // Per-section mode is now the master gate (the item-level Half/Half
  // toggle was removed). The section's UI can only flip to "split" when
  // the underlying group supports half/half, so checking the mode alone
  // is sufficient. Keep the explicit groupSupportsHalfHalf guard as a
  // belt-and-suspenders in case state is restored from an older cart.
  const sauceSplit = sauceMode === "split"
    && groupSupportsHalfHalf(sauceGroup, config, "sauce");
  const cheeseSplit = cheeseMode === "split"
    && groupSupportsHalfHalf(cheeseGroup, config, "cheese");
  const sauceMissing = !!(sauceGroup?.required) && (
    sauceSplit
      ? !customization.leftSauceOptionId || !customization.rightSauceOptionId
      : !customization.sauceOptionId
  );
  const cheeseMissing = !!(cheeseGroup?.required) && (
    cheeseSplit
      ? !customization.leftCheeseOptionId || !customization.rightCheeseOptionId
      : !customization.cheeseOptionId
  );

  // Topping groups: each required (or minSelect > 0) group must have enough picks.
  // Count placements per group across the whole pizza (left + right + whole).
  const toppingGroupsSatisfied = toppingGroups.every(g => {
    // Owner flagged toppings optional → never require a topping (allow 0).
    const min = config.toppingsOptional ? 0 : (g.required && g.minSelect < 1 ? 1 : g.minSelect);
    if (min === 0) return true;
    const count = customization.toppings.filter(t => t.groupId === g.id).length;
    return count >= min;
  });

  const otherGroupsSatisfied = otherGroups.every(g => {
    const selectedCount = (customization.otherSelections[g.id] ?? []).length;
    const min = g.required && g.minSelect < 1 ? 1 : g.minSelect;
    return selectedCount >= min;
  });

  const canAdd =
    !crustMissing &&
    !sauceMissing &&
    !cheeseMissing &&
    toppingGroupsSatisfied &&
    otherGroupsSatisfied &&
    (!item.hasVariants || !!variantId);

  // ── Missing-section nudge ─────────────────────────────────────────────────
  // When the user taps a disabled Add to Cart, we don't want a dead button.
  // Compute which section is the first one they need to fill in, then scroll
  // the modal body to that section and pulse a red ring around it for ~2.5s.
  // The order of checks below matches the visual order of the sections in
  // the modal so the user always gets walked top-down through what's missing.
  const firstMissingOtherGroup = otherGroups.find(g => {
    const min = g.required && g.minSelect < 1 ? 1 : g.minSelect;
    return (customization.otherSelections[g.id] ?? []).length < min;
  });
  const firstMissingToppingGroup = toppingGroups.find(g => {
    const min = config.toppingsOptional ? 0 : (g.required && g.minSelect < 1 ? 1 : g.minSelect);
    if (min === 0) return false;
    const count = customization.toppings.filter(t => t.groupId === g.id).length;
    return count < min;
  });
  const firstMissingSection: string | null = (() => {
    if (item.hasVariants && !variantId) return "size";
    if (crustMissing) return "crust";
    if (firstMissingOtherGroup) return `other-${firstMissingOtherGroup.id}`;
    if (sauceMissing) return "sauce";
    if (cheeseMissing) return "cheese";
    if (firstMissingToppingGroup) return `toppings`;
    return null;
  })();

  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusMissingSection = useCallback(() => {
    if (!firstMissingSection) return;
    const scope = scrollAreaRef.current ?? document;
    const el = scope.querySelector<HTMLElement>(`[data-pizza-section="${firstMissingSection}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightedSection(firstMissingSection);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedSection(null), 2500);
  }, [firstMissingSection]);

  // Helper for adding the highlight ring inline at each section.
  const ringFor = (key: string): string =>
    highlightedSection === key
      ? "ring-2 ring-red-500 ring-offset-2 rounded-2xl animate-pulse"
      : "";

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: 860, maxHeight: "96vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-start gap-4 p-5 border-b border-gray-100 flex-shrink-0">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.name}
              className="w-16 h-16 rounded-xl object-cover flex-shrink-0 shadow-sm"
            />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{item.name}</h2>
            {item.description && (
              <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{item.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl flex-shrink-0 transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* ── Body (two-column on desktop) ── */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">

          {/* ── Left: Options ──
              `flex flex-col gap-6` (was `space-y-6`) so we can use CSS
              `order` on each child section to reflect the owner's
              chosen sectionOrder from pizzaConfig. Gap matches the
              previous space-y-6 vertical rhythm exactly. */}
          <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">

            {/* Size */}
            {item.hasVariants && item.variants.length > 0 && (
              <section data-pizza-section="size" style={orderStyle(SECTION_SIZE)} className={ringFor("size")}>
                <SectionHeader label={tp("chooseSize")} required />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {item.variants.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setVariantId(v.id)}
                      className="flex flex-col items-center py-3 px-2 rounded-xl border-2 transition text-center"
                      style={
                        variantId === v.id
                          ? { borderColor: primaryColor, backgroundColor: `${primaryColor}12` }
                          : { borderColor: "#f3f4f6" }
                      }
                    >
                      <span className="text-sm font-bold text-gray-900">{v.name}</span>
                      <span className="text-xs font-semibold mt-1" style={{ color: primaryColor }}>
                        {formatCurrency(v.price)}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Crust */}
            {crustGroup && (
              <section data-pizza-section="crust" style={orderStyle(sectionIdForGroup(crustGroup))} className={ringFor("crust")}>
                <SectionHeader
                  label={tp("chooseCrust")}
                  required={crustGroup.required}
                />
                <div className="grid grid-cols-2 gap-2">
                  {crustGroup.options.filter(o => o.isAvailable).map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setCrust(opt.id)}
                      className="py-3 px-3 rounded-xl border-2 transition text-sm font-medium text-left"
                      style={
                        customization.crustOptionId === opt.id
                          ? { borderColor: primaryColor, backgroundColor: `${primaryColor}12`, color: primaryColor }
                          : { borderColor: "#f3f4f6", color: "#374151" }
                      }
                    >
                      {opt.name}
                      {opt.priceAdjustment > 0 && (
                        <span className="block text-xs font-normal text-gray-400 mt-0.5">
                          +{formatCurrency(opt.priceAdjustment)}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ── Other (non-role) modifier groups: cook level, etc. ── */}
            {otherGroups.map(g => {
              const selected = customization.otherSelections[g.id] ?? [];
              return (
                <section key={g.id} data-pizza-section={`other-${g.id}`} style={orderStyle(sectionIdForGroup(g))} className={ringFor(`other-${g.id}`)}>
                  <SectionHeader label={g.name} required={g.required || g.minSelect > 0} />
                  <div className="grid grid-cols-2 gap-2">
                    {g.options.filter(o => o.isAvailable).map(opt => {
                      const isSelected = selected.includes(opt.id);
                      return (
                        <button
                          key={opt.id}
                          onClick={() => toggleOtherOption(g, opt.id)}
                          className="py-3 px-3 rounded-xl border-2 transition text-sm font-medium text-left"
                          style={
                            isSelected
                              ? { borderColor: primaryColor, backgroundColor: `${primaryColor}12`, color: primaryColor }
                              : { borderColor: "#f3f4f6", color: "#374151" }
                          }
                        >
                          {opt.name}
                          {opt.priceAdjustment > 0 && (
                            <span className="block text-xs font-normal text-gray-400 mt-0.5">
                              +{formatCurrency(opt.priceAdjustment)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            {/* Master Half/Half toggle removed 2026-05-31 — each
                half/half-eligible section owns its own Whole/Split picker
                via the per-group supportsHalfHalf flag. effectiveHalfHalf
                derives from per-section state for the pizza visual and
                cart payload, so nothing else has to change to support
                the new flow. */}

            {/* Sauce */}
            {sauceGroup && (
              <section data-pizza-section="sauce" style={orderStyle(sectionIdForGroup(sauceGroup))} className={ringFor("sauce")}>
                <div className="flex items-center justify-between mb-2">
                  <SectionHeader label={tp("sauce")} required={sauceGroup.required} />
                  {groupSupportsHalfHalf(sauceGroup, config, "sauce") && (
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                      {(["whole", "split"] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setSauceMode(m)}
                          className="px-2.5 py-1 font-medium transition capitalize"
                          style={
                            sauceMode === m
                              ? { backgroundColor: primaryColor, color: "#fff" }
                              : { color: "#6b7280" }
                          }
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {(!groupSupportsHalfHalf(sauceGroup, config, "sauce") || sauceMode === "whole") && (
                  <OptionRow
                    options={sauceGroup.options.filter(o => o.isAvailable)}
                    selectedId={customization.sauceOptionId}
                    onSelect={id => setSauce(id, "whole")}
                    primaryColor={primaryColor}
                  />
                )}
                {groupSupportsHalfHalf(sauceGroup, config, "sauce") && sauceMode === "split" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">{tp("leftHalf")}</p>
                      <OptionRow
                        options={sauceGroup.options.filter(o => o.isAvailable)}
                        selectedId={customization.leftSauceOptionId}
                        onSelect={id => setSauce(id, "left")}
                        primaryColor={primaryColor}
                        priceMultiplier={config.halfToppingMultiplier}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">{tp("rightHalf")}</p>
                      <OptionRow
                        options={sauceGroup.options.filter(o => o.isAvailable)}
                        selectedId={customization.rightSauceOptionId}
                        onSelect={id => setSauce(id, "right")}
                        primaryColor={primaryColor}
                        priceMultiplier={config.halfToppingMultiplier}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Cheese */}
            {cheeseGroup && (
              <section data-pizza-section="cheese" style={orderStyle(sectionIdForGroup(cheeseGroup))} className={ringFor("cheese")}>
                <div className="flex items-center justify-between mb-2">
                  <SectionHeader label={tp("cheese")} required={cheeseGroup.required} />
                  {groupSupportsHalfHalf(cheeseGroup, config, "cheese") && (
                    <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                      {(["whole", "split"] as const).map(m => (
                        <button
                          key={m}
                          onClick={() => setCheeseMode(m)}
                          className="px-2.5 py-1 font-medium transition capitalize"
                          style={
                            cheeseMode === m
                              ? { backgroundColor: primaryColor, color: "#fff" }
                              : { color: "#6b7280" }
                          }
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {(!groupSupportsHalfHalf(cheeseGroup, config, "cheese") || cheeseMode === "whole") && (
                  <OptionRow
                    options={cheeseGroup.options.filter(o => o.isAvailable)}
                    selectedId={customization.cheeseOptionId}
                    onSelect={id => setCheese(id, "whole")}
                    primaryColor={primaryColor}
                  />
                )}
                {groupSupportsHalfHalf(cheeseGroup, config, "cheese") && cheeseMode === "split" && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">{tp("leftHalf")}</p>
                      <OptionRow
                        options={cheeseGroup.options.filter(o => o.isAvailable)}
                        selectedId={customization.leftCheeseOptionId}
                        onSelect={id => setCheese(id, "left")}
                        primaryColor={primaryColor}
                        priceMultiplier={config.halfToppingMultiplier}
                      />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1.5">{tp("rightHalf")}</p>
                      <OptionRow
                        options={cheeseGroup.options.filter(o => o.isAvailable)}
                        selectedId={customization.rightCheeseOptionId}
                        onSelect={id => setCheese(id, "right")}
                        primaryColor={primaryColor}
                        priceMultiplier={config.halfToppingMultiplier}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Toppings */}
            {toppingGroups.length > 0 && (
              <section data-pizza-section="toppings" style={orderStyle(SECTION_TOPPINGS)} className={ringFor("toppings")}>
                <div className="flex items-center justify-between mb-3">
                  <SectionHeader
                    label={
                      config.includedToppings > 0
                        ? tp("toppingsIncluded", { count: config.includedToppings })
                        : tp("toppings")
                    }
                  />
                  {/* Topping count badge */}
                  {customization.toppings.length > 0 && (
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {customization.toppings.length}
                    </span>
                  )}
                </div>

                {/* Placement selector for half-half mode */}
                {toppingsHaveHalfHalf && (
                  <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-4">
                    <PlacementButton
                      label={tp("leftHalfButton")}
                      active={toppingPlacement === "left"}
                      onClick={() => setToppingPlacement("left")}
                      primaryColor={primaryColor}
                    />
                    <PlacementButton
                      label={tp("wholeButton")}
                      active={toppingPlacement === "whole"}
                      onClick={() => setToppingPlacement("whole")}
                      primaryColor={primaryColor}
                    />
                    <PlacementButton
                      label={tp("rightHalfButton")}
                      active={toppingPlacement === "right"}
                      onClick={() => setToppingPlacement("right")}
                      primaryColor={primaryColor}
                    />
                  </div>
                )}

                <div className="space-y-5">
                  {toppingGroups.map(g => (
                    <div key={g.id}>
                      {toppingGroups.length > 1 && (
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                          {g.name}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {g.options.filter(o => o.isAvailable).map(opt => {
                          // The L/Whole/R placement picker only renders
                          // when toppingsHaveHalfHalf is true, so any
                          // user-selected placement is valid. When
                          // toppings aren't half/half-eligible we force
                          // "whole" regardless of toppingPlacement state.
                          const placement = toppingsHaveHalfHalf ? toppingPlacement : "whole";
                          const t = customization.toppings.find(
                            t => t.optionId === opt.id && t.placement === placement
                          );
                          return (
                            <ToppingPill
                              key={opt.id}
                              opt={opt}
                              topping={t}
                              onToggle={() => toggleTopping(opt, g.id)}
                              onSetQuantity={(qty) => setToppingQuantity(opt.id, placement, qty)}
                              onSetCount={(delta) => setToppingCount(opt.id, placement, delta)}
                              allowMultiple={effectiveConfig.allowMultipleToppings !== false}
                              primaryColor={primaryColor}
                              priceMultiplier={placement !== "whole" ? effectiveConfig.halfToppingMultiplier : 1}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Quantity legend */}
                <p className="text-xs text-gray-400 mt-3">
                  {tp("topingsHelp")}
                </p>
              </section>
            )}

            {/* Special instructions */}
            <section>
              <SectionHeader label={tp("specialInstructions")} />
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 text-gray-900 placeholder:text-gray-400"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                rows={2}
                placeholder={tp("notesPlaceholder")}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </section>
          </div>

          {/* ── Right: Pizza visual (desktop only) ── */}
          <div
            className="hidden md:flex flex-col items-center justify-start p-6 border-l border-gray-100 flex-shrink-0"
            style={{ width: 240, backgroundColor: "#fafafa" }}
          >
            <div className="w-full">
              <PizzaVisual
                isHalfHalf={customization.isHalfHalf}
                toppings={customization.toppings}
              />
            </div>
            {/* Toppings summary */}
            {customization.toppings.length > 0 && (
              <div className="mt-4 w-full">
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">{tp("yourToppings")}</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {customization.toppings.map((t, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: toppingColor(t.name) }}
                      />
                      <span className="truncate">{t.name}</span>
                      {t.placement !== "whole" && (
                        <span className="text-gray-400 flex-shrink-0">
                          ({t.placement === "left" ? "L" : "R"})
                        </span>
                      )}
                      {(t.count ?? 1) > 1 && (
                        <span className="font-semibold flex-shrink-0">×{t.count}</span>
                      )}
                      {t.quantity === "light" && (
                        <span className="font-semibold flex-shrink-0">↓</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Sticky footer ── */}
        <div className="flex-shrink-0 border-t border-gray-100 p-4 bg-white">
          {!canAdd && (
            <button
              type="button"
              onClick={focusMissingSection}
              className="flex items-center gap-2 text-xs text-red-600 mb-3 w-full text-left cursor-pointer active:bg-red-50 -mx-1 px-1 py-1 rounded-md transition touch-manipulation"
              title="Tap to jump to the section that needs your attention"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="flex-1">
                {item.hasVariants && !variantId ? tp("errors.chooseSize")
                 : crustMissing      ? tp("errors.chooseCrust")
                 : !otherGroupsSatisfied   ? tp("errors.completeSelections")
                 : sauceMissing      ? (sauceGroup?.name  ? tp("errors.chooseSauceNamed", { name: sauceGroup.name.toLowerCase() })  : tp("errors.chooseSauce"))
                 : cheeseMissing     ? (cheeseGroup?.name ? tp("errors.chooseCheeseNamed", { name: cheeseGroup.name.toLowerCase() }) : tp("errors.chooseCheese"))
                 : !toppingGroupsSatisfied ? tp("errors.chooseToppings")
                 : tp("errors.completeRequired")}
              </span>
              <span className="text-red-500 font-semibold flex-shrink-0">→</span>
            </button>
          )}
          <div className="flex items-center gap-3">
            {/* Quantity */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition flex-shrink-0"
              >
                <Minus className="w-4 h-4 text-gray-600" />
              </button>
              <span className="w-6 text-center font-bold text-gray-900">{quantity}</span>
              <button
                onClick={() => setQuantity(q => q + 1)}
                className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition flex-shrink-0"
              >
                <Plus className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            {/* Add to cart. When validation fails we deliberately leave the
                button enabled and intercept the click → scroll the user to
                the first missing section and pulse a red ring around it.
                aria-disabled still announces the state to screen readers. */}
            <button
              type="button"
              onClick={canAdd ? handleAdd : focusMissingSection}
              aria-disabled={!canAdd}
              className={`flex-1 text-white font-bold py-3 rounded-xl transition text-base touch-manipulation ${canAdd ? "cursor-pointer" : "opacity-50 cursor-pointer"}`}
              style={{ backgroundColor: primaryColor }}
            >
              {tOrd("addToCart")} · {formatCurrency(lineTotal)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small shared sub-components ───────────────────────────────────────────────

function SectionHeader({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-sm font-bold text-gray-900">{label}</span>
      {required && (
        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
          Required
        </span>
      )}
    </div>
  );
}

/** Single-select horizontal pill row (for sauce / cheese) */
function OptionRow({
  options, selectedId, onSelect, primaryColor, priceMultiplier = 1,
}: {
  options: ModOption[]; selectedId: string | null;
  onSelect: (id: string) => void; primaryColor: string;
  /** On a single half, the option costs this fraction of its whole-pizza price
   *  (e.g. 0.5). The displayed "+$X" is scaled to match what's charged. 1 = whole. */
  priceMultiplier?: number;
}) {
  const formatCurrency = useCurrencyFormat();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const shown = Math.round(opt.priceAdjustment * priceMultiplier * 100) / 100;
        return (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          className="px-3 py-1.5 rounded-full text-sm font-medium border-2 transition"
          style={
            selectedId === opt.id
              ? { borderColor: primaryColor, backgroundColor: `${primaryColor}15`, color: primaryColor }
              : { borderColor: "#f3f4f6", color: "#374151" }
          }
        >
          {opt.name}
          {shown > 0 && (
            <span className="ml-1 text-xs opacity-70">+{formatCurrency(shown)}</span>
          )}
        </button>
        );
      })}
    </div>
  );
}
