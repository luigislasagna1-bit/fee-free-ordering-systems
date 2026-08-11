/**
 * Voice order-line COMPILER — turns a spoken *intent* into the exact
 * `/api/orders` wire payload for a pizza or a combo.
 *
 * WHY THIS EXISTS (2026-08-11). The order route accepts a payload shape with
 * several traps that are lethal if a language model hand-assembles it:
 *
 *  1. Half-and-half is encoded ONLY as a free-text `name` prefix — "(L.H) ",
 *     "(R.H) ", "(W) " — with a MANDATORY trailing space
 *     (`isHalfToppingName`). Omit the name and a half topping silently becomes
 *     a whole one at a different price.
 *  2. Two of the same topping is TWO array entries, not `count: 2`.
 *  3. `toppingBaseAdjust` is applied whenever pizzaConfig parses, even with
 *     ZERO topping lines — so a preset pizza sent bare bills BELOW list price
 *     (a $20 pizza with 5 included @ $2 bills $10) and the kitchen makes a
 *     plain pizza.
 *  4. Required modifier groups are NOT enforced server-side — a pizza with no
 *     crust returns 201.
 *  5. A combo sent without `bundleItems` creates a zero-child combo at the
 *     parent price, silently.
 *
 * So the model never writes the wire format. It says what the caller wants in
 * the small structured shape below; this module compiles it, and anything it
 * cannot resolve confidently comes back in `unresolved[]` for the agent to ask
 * about rather than being guessed.
 *
 * PURE — no prisma, no next, no react. The caller supplies the item data (from
 * /api/internal/voice/item-options). Money quoted here is ADVISORY, for the
 * spoken read-back; the authoritative total always comes from the order route
 * (dryRun preview or the 201).
 */

import type { PizzaConfig } from "@/lib/pizza-config-parse";
import {
  priceToppingLines,
  toppingBaseAdjust,
  type ToppingChargeLine,
  type ToppingPricingConfig,
} from "@/lib/pizza-topping-pricing";

/* ────────────────────────────── wire shapes ────────────────────────────── */

/** One modifier entry exactly as `/api/orders` wants it. */
export type CompiledModifier = { modifierOptionId: string; name: string };

/** One order line exactly as `/api/orders` wants it. */
export type CompiledLine = {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  modifiers: CompiledModifier[];
  notes?: string | null;
  /** Combo lines only — the route requires BOTH of these to take the combo path. */
  isCombo?: true;
  bundleItems?: Array<{
    menuItemId: string;
    variantId: string | null;
    name: string;
    modifiers: CompiledModifier[];
  }>;
};

/* ───────────────────────────── intent shapes ───────────────────────────── */

export type Placement = "whole" | "left" | "right";

/** What the model says the caller asked for on one pizza. */
export type PizzaIntent = {
  menuItemId: string;
  /** Spoken size ("large"); resolved against the item's variants. */
  size?: string | null;
  /** Spoken topping requests. `count` 2 = double pepperoni. */
  toppings?: Array<{ name: string; placement?: Placement; count?: number }>;
  /** Spoken crust / sauce / cheese picks; omitted = store default. */
  crust?: string | null;
  sauce?: string | null;
  cheese?: string | null;
  quantity?: number;
  notes?: string | null;
};

export type ComboIntent = {
  menuItemId: string;
  /** One entry per slot pick, in slot order. A pizza pick carries its own
   *  toppings/size, compiled through the same pizza path. */
  picks: Array<{ menuItemId: string; size?: string | null; toppings?: PizzaIntent["toppings"] }>;
  quantity?: number;
  notes?: string | null;
};

/* ─────────────────────────── item data (input) ─────────────────────────── */

export type OptionData = { modifierOptionId: string; name: string; priceAdjustment: number; isDefault?: boolean };
export type GroupData = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  pizzaRole?: string | null;
  options: OptionData[];
};
export type VariantData = { variantId: string; name: string; price: number; isDefault?: boolean };

export type ItemData = {
  menuItemId: string;
  name: string;
  price: number;
  hasVariants: boolean;
  variants: VariantData[];
  /** Item-level groups UNIONED with the category-level groups — the same union
   *  `/api/orders` validates against. The caller must pre-merge them. */
  modifierGroups: GroupData[];
  pizzaConfig: PizzaConfig | null;
  isSoldOut?: boolean;
};

export type ComboSlotData = {
  id: string;
  label: string;
  min: number;
  max: number;
  /** Eligible picks for this slot, already resolved to real items. */
  choices: ItemData[];
};
export type ComboData = {
  menuItemId: string;
  name: string;
  price: number;
  slots: ComboSlotData[];
  extrasCharge: boolean;
  sharedToppings?: number;
};

/* ─────────────────────────────── result ────────────────────────────────── */

export type CompileResult = {
  line: CompiledLine | null;
  /** Plain-language confirmation for the agent to speak back. */
  readBack: string;
  /** Money the caller should hear BEFORE confirming (Luigi 2026-08-10:
   *  always announce the over-allowance charge). Null when nothing to say. */
  pricingNote: string | null;
  /** Things the agent must ask about. Non-empty ⇒ do NOT place the order. */
  unresolved: string[];
};

/* ───────────────────────────── name matching ───────────────────────────── */

/** Spoken text → comparable key. STT gives us "extra cheese", the menu says
 *  "Extra Cheese"; punctuation and plurals are noise. */
const norm = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Singular-ish form so "mushrooms" matches "Mushroom". */
const stem = (s: string): string => norm(s).replace(/e?s$/, "");

/**
 * Resolve one spoken option name within a set of groups.
 * Exact-normalised first, then stem, then a UNIQUE substring hit. Ambiguous or
 * missing → null, so the caller can ask instead of guessing (an invented id is
 * a hard 400 on the item path and is SILENTLY DROPPED on a combo child).
 */
export function resolveOption(spoken: string, groups: GroupData[]): OptionData | null {
  const all = groups.flatMap((g) => g.options);
  if (!all.length) return null;
  const want = norm(spoken);
  if (!want) return null;

  const exact = all.filter((o) => norm(o.name) === want);
  if (exact.length === 1) return exact[0];

  const wantStem = stem(spoken);
  const stemmed = all.filter((o) => stem(o.name) === wantStem);
  if (stemmed.length === 1) return stemmed[0];

  const partial = all.filter((o) => norm(o.name).includes(want) || want.includes(norm(o.name)));
  if (partial.length === 1) return partial[0];

  return null; // absent or ambiguous — the agent must ask
}

/** Resolve a spoken size against the item's variants. */
export function resolveVariant(spoken: string | null | undefined, variants: VariantData[]): VariantData | null {
  if (!variants.length) return null;
  if (!spoken) {
    // No size said: auto-apply only when there is exactly one, or a default.
    if (variants.length === 1) return variants[0];
    return variants.find((v) => v.isDefault) ?? null;
  }
  const want = norm(spoken);
  return (
    variants.find((v) => norm(v.name) === want) ??
    variants.find((v) => norm(v.name).includes(want) || want.includes(norm(v.name))) ??
    null
  );
}

/* ──────────────────────────── prefix writing ───────────────────────────── */

/** The half/half convention, written by CODE so the model never types it.
 *  The trailing space is load-bearing — `isHalfToppingName` matches "(L.H) ". */
export function placementPrefix(placement: Placement, isHalfHalfPizza: boolean): string {
  if (placement === "left") return "(L.H) ";
  if (placement === "right") return "(R.H) ";
  return isHalfHalfPizza ? "(W) " : "";
}

/* ───────────────────────────── pizza compile ───────────────────────────── */

const money = (n: number, currency = "$") => `${currency}${n.toFixed(2)}`;

/** Groups belonging to a pizza role, by pizzaConfig group id or pizzaRole tag. */
function groupsForRole(item: ItemData, role: "crust" | "sauce" | "cheese"): GroupData[] {
  const cfg = item.pizzaConfig;
  const byId = cfg
    ? item.modifierGroups.filter(
        (g) =>
          (role === "crust" && g.id === cfg.crustGroupId) ||
          (role === "sauce" && g.id === cfg.sauceGroupId) ||
          (role === "cheese" && g.id === cfg.cheeseGroupId),
      )
    : [];
  if (byId.length) return byId;
  return item.modifierGroups.filter((g) => g.pizzaRole === role);
}

function toppingGroups(item: ItemData): GroupData[] {
  const cfg = item.pizzaConfig;
  const byId = cfg?.toppingGroupIds?.length
    ? item.modifierGroups.filter((g) => cfg.toppingGroupIds.includes(g.id))
    : [];
  if (byId.length) return byId;
  return item.modifierGroups.filter((g) => g.pizzaRole === "toppings");
}

/**
 * Compile a spoken pizza into a wire line.
 *
 * @param askGroupIds Group ids the STORE wants always confirmed aloud
 *   (VoiceAgentConfig.pizzaAskGroups). Those land in `unresolved` when the
 *   caller hasn't chosen, so the agent asks instead of taking the default.
 */
export function compilePizzaLine(
  intent: PizzaIntent,
  item: ItemData,
  opts: { askGroupIds?: string[]; currency?: string } = {},
): CompileResult {
  const unresolved: string[] = [];
  const currency = opts.currency ?? "$";
  const ask = new Set(opts.askGroupIds ?? []);
  const cfg = item.pizzaConfig;

  if (item.isSoldOut) {
    return { line: null, readBack: "", pricingNote: null, unresolved: [`"${item.name}" is sold out.`] };
  }

  // ── size ──────────────────────────────────────────────────────────────
  let variant: VariantData | null = null;
  if (item.hasVariants && item.variants.length) {
    variant = resolveVariant(intent.size, item.variants);
    if (!variant) {
      unresolved.push(
        intent.size
          ? `Size "${intent.size}" isn't offered for ${item.name}. Sizes: ${item.variants.map((v) => v.name).join(", ")}.`
          : `Which size for ${item.name}? ${item.variants.map((v) => v.name).join(", ")}.`,
      );
    }
  }

  const mods: CompiledModifier[] = [];
  const spokenParts: string[] = [];

  // ── crust / sauce / cheese: smart default, unless the store says ask ───
  for (const role of ["crust", "sauce", "cheese"] as const) {
    const groups = groupsForRole(item, role);
    if (!groups.length) continue;
    const spoken = intent[role];
    const mustAsk = groups.some((g) => ask.has(g.id));

    if (spoken) {
      const opt = resolveOption(spoken, groups);
      if (!opt) {
        unresolved.push(
          `We don't have "${spoken}" for ${role}. Options: ${groups.flatMap((g) => g.options).map((o) => o.name).join(", ")}.`,
        );
        continue;
      }
      mods.push({ modifierOptionId: opt.modifierOptionId, name: opt.name });
      spokenParts.push(opt.name);
      continue;
    }

    if (mustAsk) {
      unresolved.push(`Which ${role}? ${groups.flatMap((g) => g.options).map((o) => o.name).join(", ")}.`);
      continue;
    }

    // Smart default: the marked default, else the single option, else the
    // first — but ONLY for a required group. Never invent an optional extra.
    const required = groups.some((g) => g.required || g.minSelect > 0);
    if (!required) continue;
    const pool = groups.flatMap((g) => g.options);
    const def = pool.find((o) => o.isDefault) ?? (pool.length === 1 ? pool[0] : pool[0]);
    if (def) mods.push({ modifierOptionId: def.modifierOptionId, name: def.name });
  }

  // ── toppings ──────────────────────────────────────────────────────────
  const tGroups = toppingGroups(item);
  const requested = intent.toppings ?? [];
  const isHalfHalf = requested.some((t) => t.placement === "left" || t.placement === "right");
  if (isHalfHalf && cfg && cfg.allowHalfHalf === false) {
    unresolved.push(`${item.name} can't be split into halves.`);
  }

  const chargeLines: ToppingChargeLine[] = [];
  for (const t of requested) {
    const opt = resolveOption(t.name, tGroups);
    if (!opt) {
      unresolved.push(`I couldn't find "${t.name}" on the toppings for ${item.name}.`);
      continue;
    }
    const placement: Placement = t.placement ?? "whole";
    // Per-UNIT expansion: double pepperoni is two entries, not count: 2.
    const count = Math.max(1, Math.min(10, Math.floor(Number(t.count) || 1)));
    for (let i = 0; i < count; i++) {
      mods.push({
        modifierOptionId: opt.modifierOptionId,
        name: `${placementPrefix(placement, isHalfHalf)}${opt.name}`,
      });
      chargeLines.push({
        optionId: opt.modifierOptionId,
        optionPrice: opt.priceAdjustment,
        isHalf: placement !== "whole",
      });
    }
    spokenParts.push(
      `${count > 1 ? `${count}× ` : ""}${opt.name}${placement === "left" ? " on the left half" : placement === "right" ? " on the right half" : ""}`,
    );
  }

  // ── preset seeding: a preset pizza must NEVER arrive bare ──────────────
  // toppingBaseAdjust is applied whenever pizzaConfig parses, even with zero
  // topping lines, so an unseeded preset pizza bills BELOW list price and the
  // kitchen makes a plain one. Seed the configured presets the caller didn't
  // already name or explicitly remove.
  if (cfg?.presetToppings?.length) {
    const already = new Set(mods.map((m) => m.modifierOptionId));
    const poolOptions = tGroups.flatMap((g) => g.options);
    for (const presetId of cfg.presetToppings) {
      if (already.has(presetId)) continue;
      const opt = poolOptions.find((o) => o.modifierOptionId === presetId);
      if (!opt) continue;
      mods.push({
        modifierOptionId: opt.modifierOptionId,
        name: `${placementPrefix("whole", isHalfHalf)}${opt.name}`,
      });
      chargeLines.push({ optionId: opt.modifierOptionId, optionPrice: opt.priceAdjustment, isHalf: false });
    }
  }

  // ── advisory topping money (the over-allowance announcement) ───────────
  let pricingNote: string | null = null;
  if (cfg) {
    const flat = variant?.name && cfg.variantToppingPrices?.[variant.name] !== undefined
      ? Number(cfg.variantToppingPrices[variant.name]) || 0
      : cfg.extraToppingPrice;
    const pricing: ToppingPricingConfig = {
      extraToppingPrice: flat,
      includedToppings: cfg.includedToppings,
      halfToppingMultiplier: cfg.halfToppingMultiplier,
      reduceOnRemove: cfg.reduceOnRemove,
    };
    if (flat > 0 && chargeLines.length) {
      const charges = priceToppingLines(pricing, chargeLines);
      const toppingTotal = charges.reduce((a, b) => a + b, 0) + toppingBaseAdjust(pricing);
      const extra = Math.round(toppingTotal * 100) / 100;
      const halves = chargeLines.filter((l) => l.isHalf).length;
      const wholes = chargeLines.length - halves;
      const countLabel = `${wholes + halves} topping${wholes + halves === 1 ? "" : "s"}`;
      if (extra > 0) {
        pricingNote = `${countLabel}; ${cfg.includedToppings} included, so that's ${money(extra, currency)} extra.`;
      } else if (extra < 0) {
        pricingNote = `${countLabel} — that's ${money(Math.abs(extra), currency)} less than the standard build.`;
      }
    }
  }

  if (unresolved.length) return { line: null, readBack: "", pricingNote, unresolved };

  const quantity = Math.max(1, Math.min(99, Math.floor(Number(intent.quantity) || 1)));
  const sizeLabel = variant ? `${variant.name} ` : "";
  const readBack =
    `${quantity > 1 ? `${quantity}× ` : ""}${sizeLabel}${item.name}` +
    (spokenParts.length ? ` with ${spokenParts.join(", ")}` : "");

  return {
    line: {
      menuItemId: item.menuItemId,
      variantId: variant?.variantId ?? null,
      quantity,
      modifiers: mods,
      notes: intent.notes ?? null,
    },
    readBack,
    pricingNote,
    unresolved: [],
  };
}

/* ───────────────────────────── combo compile ───────────────────────────── */

/**
 * Compile a spoken combo. The server does slot assignment greedily in
 * `bundleItems` order, so picks are emitted in slot order. A combo line MUST
 * carry `isCombo: true` and a non-empty `bundleItems` — without both, the route
 * silently creates a zero-child combo at the parent price.
 */
export function compileComboLine(
  intent: ComboIntent,
  combo: ComboData,
  opts: { askGroupIds?: string[]; currency?: string } = {},
): CompileResult {
  const unresolved: string[] = [];
  const children: NonNullable<CompiledLine["bundleItems"]> = [];
  const spokenParts: string[] = [];
  const notes: string[] = [];

  // Assign each pick to the first slot that accepts it and still has room —
  // mirroring the server's greedy first-fit so what we emit is what it books.
  const fill = combo.slots.map(() => 0);
  const picks = intent.picks ?? [];

  for (const pick of picks) {
    let slotIndex = -1;
    for (let i = 0; i < combo.slots.length; i++) {
      const s = combo.slots[i];
      if (fill[i] >= s.max) continue;
      if (s.choices.some((c) => c.menuItemId === pick.menuItemId)) {
        slotIndex = i;
        break;
      }
    }
    if (slotIndex < 0) {
      unresolved.push(`That isn't one of the choices for ${combo.name}.`);
      continue;
    }
    const slot = combo.slots[slotIndex];
    const child = slot.choices.find((c) => c.menuItemId === pick.menuItemId)!;
    fill[slotIndex] += 1;

    // A pizza child goes through the SAME pizza compiler, so half/half,
    // per-unit expansion and preset seeding behave identically inside a combo.
    if (child.pizzaConfig) {
      const sub = compilePizzaLine(
        { menuItemId: child.menuItemId, size: pick.size, toppings: pick.toppings },
        child,
        opts,
      );
      if (!sub.line) {
        unresolved.push(...sub.unresolved);
        continue;
      }
      children.push({
        menuItemId: child.menuItemId,
        variantId: sub.line.variantId,
        name: child.name,
        modifiers: sub.line.modifiers,
      });
      spokenParts.push(sub.readBack);
      if (sub.pricingNote) notes.push(sub.pricingNote);
      continue;
    }

    // Non-pizza child: size only. The server requires a resolvable variant
    // whenever the allowed pool isn't exactly one.
    const variant = resolveVariant(pick.size, child.variants);
    if (child.hasVariants && child.variants.length && !variant) {
      unresolved.push(
        `Which size for the ${child.name}? ${child.variants.map((v) => v.name).join(", ")}.`,
      );
      continue;
    }
    children.push({
      menuItemId: child.menuItemId,
      variantId: variant?.variantId ?? null,
      name: child.name,
      modifiers: [],
    });
    spokenParts.push(`${variant ? `${variant.name} ` : ""}${child.name}`);
  }

  // Every slot's minimum must be satisfied or the route 400s at the end.
  combo.slots.forEach((s, i) => {
    if (fill[i] < s.min) {
      const remaining = s.min - fill[i];
      unresolved.push(
        `Still need ${remaining} more for ${s.label || "a slot"}: ${s.choices.map((c) => c.name).slice(0, 8).join(", ")}.`,
      );
    }
  });

  if (unresolved.length || !children.length) {
    if (!children.length && !unresolved.length) unresolved.push(`What would you like in the ${combo.name}?`);
    return { line: null, readBack: "", pricingNote: notes.join(" ") || null, unresolved };
  }

  const quantity = Math.max(1, Math.min(99, Math.floor(Number(intent.quantity) || 1)));
  return {
    line: {
      menuItemId: combo.menuItemId,
      variantId: null,
      quantity,
      modifiers: [],
      notes: intent.notes ?? null,
      isCombo: true,
      bundleItems: children,
    },
    readBack: `${quantity > 1 ? `${quantity}× ` : ""}${combo.name}: ${spokenParts.join(", ")}`,
    pricingNote: notes.join(" ") || null,
    unresolved: [],
  };
}
