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
   *  size, toppings AND crust/sauce/cheese — without those a caller who says
   *  "the Family Deal with a thin-crust pepperoni" had nowhere to put "thin
   *  crust", and a store that forces crust to be asked deadlocked the call. */
  picks: Array<{
    menuItemId: string;
    size?: string | null;
    toppings?: PizzaIntent["toppings"];
    crust?: string | null;
    sauce?: string | null;
    cheese?: string | null;
    notes?: string | null;
  }>;
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
  isSoldOut?: boolean;
  /** True when a slot's choices were capped — the agent must not tell a caller
   *  "that isn't one of the choices" for something the store actually sells. */
  choicesTruncated?: boolean;
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
  /** What this line costs, computed with the SAME pure engine the order route
   *  charges with (base + toppingBaseAdjust + Σ priceToppingLines) × quantity.
   *  Used to compare a pizza against a cheaper same-day deal without asking the
   *  model to do arithmetic. Null when the line didn't compile. */
  lineSubtotal?: number | null;
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
 * 🚨 NEGATION. A caller who says "no onions" must never be sold onions.
 * The substring pass below matched `"no onions".includes("onion")` and happily
 * returned the Onion option — the single worst class of bug this compiler can
 * have, because the money is right and the FOOD is wrong. Anything carrying a
 * refusal word is rejected outright and handed back to the agent to ask about.
 */
const NEGATION =
  /(^|\s)(no|not|non|without|w\/o|hold|skip|omit|remove|minus|less|lose|leave off|leave out|none|never|zero|free of|allergic)(\s|$)/;

/** Words a caller may pile around a topping name without changing WHICH topping
 *  it is. Everything else in the leftover text means we matched the wrong thing
 *  ("chicken bacon ranch" is not "Bacon"). */
const QUALIFIERS = new Set([
  "a", "an", "the", "some", "please", "just", "with", "and", "of", "on", "it", "that",
  "extra", "double", "triple", "more", "heavy", "light", "easy", "side", "plus", "add",
  "lots", "lot", "little", "bit", "well", "done", "all", "over", "sauce", "topping", "toppings",
]);

/** Cheap phonetic key — enough to bridge the ASR errors phone audio actually
 *  produces ("peperoni", "pepproni", "pepparoni" → one key). Not a full
 *  Metaphone: consonant skeleton after normalising the usual spellings. */
const phonetic = (s: string): string =>
  stem(s)
    .replace(/[^a-z]/g, "")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/sch/g, "sk")
    .replace(/c(?=[ei])/g, "s")
    .replace(/[ckq]/g, "k")
    .replace(/x/g, "ks")
    .replace(/z/g, "s")
    .replace(/(.)\1+/g, "$1")
    .replace(/(?!^)[aeiouy]/g, "");

/** Levenshtein distance, capped — used only after the exact passes fail. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/** How far off a spoken word may be before we stop guessing. Scales with
 *  length so "pep" can't fuzzy-match "Ham" but "peperoni" can reach
 *  "Pepperoni". */
const fuzzyBudget = (len: number): number => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

export type OptionMatch =
  | { ok: true; option: OptionData }
  | { ok: false; reason: "negated" | "ambiguous" | "not_found"; suggestions: string[] };

/**
 * Resolve one spoken option name within a set of groups.
 *
 * Passes, in order: negation guard → exact → stem → tightened substring →
 * phonetic → bounded fuzzy. Anything unresolved comes back with the closest
 * real menu names so the agent can ask "did you mean X?" instead of a
 * dead-end "I couldn't find that" — per-restaurant lexical grounding is the
 * whole point of owning the catalog.
 *
 * Never guesses: an invented id is a hard 400 on the item path and is SILENTLY
 * DROPPED on a combo child.
 */
export function matchOption(spoken: string, groups: GroupData[]): OptionMatch {
  const all = groups.flatMap((g) => g.options);
  const near = (n = 3) => {
    const w = stem(spoken);
    return [...all]
      .sort((a, b) => editDistance(stem(a.name), w) - editDistance(stem(b.name), w))
      .slice(0, n)
      .map((o) => o.name);
  };
  if (!all.length) return { ok: false, reason: "not_found", suggestions: [] };

  const want = norm(spoken);
  if (!want) return { ok: false, reason: "not_found", suggestions: near() };

  // Exact and stem run BEFORE the negation guard on purpose. Real menus carry
  // options literally named "No Onions" or "Non-Dairy Cheese" — a store that
  // models a removal as an option should get that option, and "non-dairy"
  // must not be read as a refusal. Only a phrase that matches nothing exactly
  // is then tested for negation.
  const exact = all.filter((o) => norm(o.name) === want);
  if (exact.length === 1) return { ok: true, option: exact[0] };
  if (exact.length > 1) return { ok: false, reason: "ambiguous", suggestions: near() };

  const wantStem = stem(spoken);
  const stemmed = all.filter((o) => stem(o.name) === wantStem);
  if (stemmed.length === 1) return { ok: true, option: stemmed[0] };
  if (stemmed.length > 1) return { ok: false, reason: "ambiguous", suggestions: near() };

  if (NEGATION.test(` ${want} `)) {
    return { ok: false, reason: "negated", suggestions: [] };
  }

  // Substring, but only where the EXTRA words are harmless qualifiers. The old
  // unconditional `want.includes(name)` is what turned "no onions" into onions
  // and "chicken bacon ranch" into bacon.
  const partial = all.filter((o) => {
    const name = norm(o.name);
    if (name.includes(want)) return true; // caller said a prefix of the real name
    if (!want.includes(name)) return false;
    const leftover = want.replace(name, " ").split(" ").filter(Boolean);
    return leftover.every((w) => QUALIFIERS.has(w));
  });
  if (partial.length === 1) return { ok: true, option: partial[0] };
  if (partial.length > 1) return { ok: false, reason: "ambiguous", suggestions: near() };

  // Mis-heard on a noisy line: "peperoni", "pepproni", "moozarella".
  const key = phonetic(spoken);
  if (key.length >= 3) {
    const sounded = all.filter((o) => phonetic(o.name) === key);
    if (sounded.length === 1) return { ok: true, option: sounded[0] };
  }

  const budget = fuzzyBudget(wantStem.length);
  if (budget > 0) {
    const scored = all
      .map((o) => ({ o, d: editDistance(stem(o.name), wantStem) }))
      .filter((x) => x.d <= budget)
      .sort((a, b) => a.d - b.d);
    if (scored.length === 1 || (scored.length > 1 && scored[0].d < scored[1].d)) {
      return { ok: true, option: scored[0].o };
    }
  }

  return { ok: false, reason: "not_found", suggestions: near() };
}

/** Back-compat thin wrapper — option or null. Prefer `matchOption`, which
 *  explains WHY it failed and what to offer instead. */
export function resolveOption(spoken: string, groups: GroupData[]): OptionData | null {
  const m = matchOption(spoken, groups);
  return m.ok ? m.option : null;
}

/** Size words that make a spoken size a DIFFERENT size from the menu one.
 *  "extra large" must never quietly become "Large". */
const SIZE_MODIFIERS = new Set([
  "extra", "x", "xl", "xxl", "jumbo", "giant", "super", "mega", "family", "party",
  "mini", "personal", "kids", "half", "double",
]);

/** Resolve a spoken size against the item's variants. */
export function resolveVariant(spoken: string | null | undefined, variants: VariantData[]): VariantData | null {
  if (!variants.length) return null;
  if (!spoken) {
    // No size said: auto-apply only when there is exactly one, or a default.
    if (variants.length === 1) return variants[0];
    return variants.find((v) => v.isDefault) ?? null;
  }
  const want = norm(spoken);
  const exact = variants.find((v) => norm(v.name) === want);
  if (exact) return exact;

  const partial = variants.filter((v) => {
    const name = norm(v.name);
    if (name.includes(want)) return true;
    if (!want.includes(name)) return false;
    // "extra large" contains "large" — but the store doesn't sell extra large,
    // so silently shrinking the order is the wrong answer. Only accept when the
    // leftover words don't change the size.
    const leftover = want.replace(name, " ").split(" ").filter(Boolean);
    return leftover.every((w) => !SIZE_MODIFIERS.has(w));
  });
  return partial.length === 1 ? partial[0] : null;
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

/** Spoken money. `currency` is the restaurant's ISO code ("usd", "cad", "eur"),
 *  NOT a symbol — concatenating it produced "usd6.00", which the TTS reads out
 *  as "you ess dee six dollars". Intl gives the real symbol and is pure, so the
 *  compiler stays dependency-free. */
const money = (n: number, currency = "usd"): string => {
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: (currency || "usd").toUpperCase(),
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`; // unknown/invalid code — never break a read-back
  }
};

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

/** The schema stores the tag SINGULAR ("topping"); an earlier version of this
 *  file matched only "toppings", so any pizza whose pizzaConfig has no
 *  toppingGroupIds fell through to an EMPTY topping list and answered "I
 *  couldn't find pepperoni" for every topping on the menu. Accept both. */
const isToppingRole = (role: string | null | undefined): boolean =>
  role === "topping" || role === "toppings";

function toppingGroups(item: ItemData): GroupData[] {
  const cfg = item.pizzaConfig;
  const byId = cfg?.toppingGroupIds?.length
    ? item.modifierGroups.filter((g) => cfg.toppingGroupIds.includes(g.id))
    : [];
  if (byId.length) return byId;
  return item.modifierGroups.filter((g) => isToppingRole(g.pizzaRole));
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
  opts: {
    askGroupIds?: string[];
    currency?: string;
    /** Combo children only. A pizza inside a combo is NOT priced by this
     *  engine — combo-child-pricing / the shared topping pool decide, and
     *  `extrasCharge:false` means the extras are free. Quoting the standalone
     *  number there announces money the caller will never be charged. */
    suppressPricingNote?: boolean;
  } = {},
): CompileResult {
  const unresolved: string[] = [];
  const currency = opts.currency ?? "usd";
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

    const poolNames = () => groups.flatMap((g) => g.options).map((o) => o.name).join(", ");

    if (spoken) {
      const m = matchOption(spoken, groups);
      if (!m.ok) {
        unresolved.push(
          m.reason === "negated"
            ? `Which ${role} would they like instead? Options: ${poolNames()}.`
            : `We don't have "${spoken}" for ${role}. Options: ${poolNames()}.`,
        );
        continue;
      }
      mods.push({ modifierOptionId: m.option.modifierOptionId, name: m.option.name });
      spokenParts.push(m.option.name);
      continue;
    }

    if (mustAsk) {
      unresolved.push(`Which ${role}? ${poolNames()}.`);
      continue;
    }

    // Smart default for a REQUIRED group only — never invent an optional extra.
    //
    // ⚠️ The old fallback was `pool.find(isDefault) ?? pool[0]`, i.e. "whatever
    // sorts first". Nothing in the schema forces a group to HAVE a default, so
    // a store whose crust list starts with "Stuffed Crust (+$4.00)" silently
    // sold a $4 upgrade the caller never asked for and never heard. A default
    // is only safe when the store actually marked one, or there is only one
    // choice; otherwise ASK.
    const required = groups.some((g) => g.required || g.minSelect > 0);
    if (!required) continue;
    const pool = groups.flatMap((g) => g.options);
    const def = pool.find((o) => o.isDefault) ?? (pool.length === 1 ? pool[0] : null);
    if (!def) {
      if (pool.length) unresolved.push(`Which ${role}? ${poolNames()}.`);
      continue;
    }
    mods.push({ modifierOptionId: def.modifierOptionId, name: def.name });
    // A default that COSTS money must be spoken — silence plus a surcharge is
    // how a caller gets surprised at pickup.
    if ((Number(def.priceAdjustment) || 0) > 0) spokenParts.push(def.name);
  }

  // ── every OTHER required group (cook level, size-of-fries, …) ─────────
  // A pizza's required groups are not only crust/sauce/cheese: Luigi's carry a
  // required "Cook Level" with no pizzaRole at all. The web builder applies its
  // default; the phone path skipped it entirely, so the same order produced a
  // DIFFERENT kitchen ticket depending on where it came from. Fill the store's
  // own default, ask when there is a real choice and no default, and never
  // invent an optional extra.
  const roleGroupIds = new Set(
    (["crust", "sauce", "cheese"] as const).flatMap((r) => groupsForRole(item, r).map((g) => g.id)),
  );
  for (const g of item.modifierGroups) {
    if (roleGroupIds.has(g.id) || isToppingRole(g.pizzaRole) || g.pizzaRole === "garnish") continue;
    if (toppingGroups(item).some((t) => t.id === g.id)) continue;
    if (!(g.required || g.minSelect > 0) || !g.options.length) continue;
    if (ask.has(g.id)) {
      unresolved.push(`Which ${g.name}? ${g.options.map((o) => o.name).join(", ")}.`);
      continue;
    }
    const def = g.options.find((o) => o.isDefault) ?? (g.options.length === 1 ? g.options[0] : null);
    if (!def) {
      unresolved.push(`Which ${g.name}? ${g.options.map((o) => o.name).join(", ")}.`);
      continue;
    }
    mods.push({ modifierOptionId: def.modifierOptionId, name: def.name });
    if ((Number(def.priceAdjustment) || 0) > 0) spokenParts.push(def.name);
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
    const m = matchOption(t.name, tGroups);
    if (!m.ok) {
      unresolved.push(
        m.reason === "negated"
          ? // A refusal is not a topping. Say so plainly rather than adding the
            // thing the caller just told us to leave off.
            `The caller said "${t.name}" — that's a topping to LEAVE OFF, not add. Only name toppings they want ON the pizza; confirm with them if unsure.`
          : m.suggestions.length
            ? `I couldn't find "${t.name}" on ${item.name}. Did they mean ${m.suggestions.slice(0, 3).join(", ")}?`
            : `I couldn't find "${t.name}" on the toppings for ${item.name}.`,
      );
      continue;
    }
    const opt = m.option;
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
  // RESOLVED = the preset matched a real option on this item. SEEDED = we also
  // had to add it (the caller hadn't already named it). The config-drift guard
  // below keys off RESOLVED — a caller who names every preset themselves is a
  // correctly-configured pizza, not a broken one.
  let presetsResolved = 0;
  if (cfg?.presetToppings?.length) {
    const already = new Set(mods.map((m) => m.modifierOptionId));
    const poolOptions = tGroups.flatMap((g) => g.options);
    for (const preset of cfg.presetToppings) {
      // 🚨 presetToppings are stored as option NAMES, not ids (MenuClient
      // migrates legacy id entries to names on every save — the ids are
      // LIBRARY ids anyway, while the loader exposes the ATTACHED-copy id). An
      // id-only lookup therefore missed on real data, seeding nothing, and the
      // pizza went out bare: toppingBaseAdjust still applied its included
      // allowance as a base credit, so a $20 five-topping pizza billed $10 and
      // the kitchen got a ticket with no toppings on it. Match id OR name,
      // exactly like the customer-side builder does.
      const opt = poolOptions.find(
        (o) => o.modifierOptionId === preset || norm(o.name) === norm(preset),
      );
      if (!opt) continue;
      presetsResolved++;
      if (already.has(opt.modifierOptionId)) continue; // caller already named it
      already.add(opt.modifierOptionId);
      mods.push({
        modifierOptionId: opt.modifierOptionId,
        name: `${placementPrefix("whole", isHalfHalf)}${opt.name}`,
      });
      chargeLines.push({ optionId: opt.modifierOptionId, optionPrice: opt.priceAdjustment, isHalf: false });
      // The kitchen ticket and the read-back must agree — a preset the caller
      // never mentioned is still on the pizza they're about to pay for.
      spokenParts.push(opt.name);
    }
  }

  // ── advisory topping money (the over-allowance announcement) ───────────
  let pricingNote: string | null = null;
  let lineSubtotal: number | null = null;
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
    // FAIL LOUD rather than sell a half-price pizza. If the store configured
    // preset toppings and NONE of them resolved against this item's groups, the
    // config has drifted (renamed option, group detached) — and on the
    // symmetric model that silently bills below list. Refusing the sale and
    // asking a human is strictly better than charging $10 for a $20 pizza.
    if (cfg.presetToppings?.length && presetsResolved === 0 && toppingBaseAdjust(pricing) < 0) {
      unresolved.push(
        `${item.name}'s standard toppings aren't set up correctly, so I can't price it by voice. Take this one yourself or transfer the caller.`,
      );
    }

    // The line's own money, by the same rules the charge path uses. Computed
    // whether or not we speak a pricing note, because the day-deal comparison
    // needs it even when there is nothing to announce.
    {
      const basePrice = variant ? variant.price : item.price;
      const charges = priceToppingLines(pricing, chargeLines);
      const toppings = charges.reduce((a, b) => a + b, 0);
      lineSubtotal =
        Math.round(Math.max(0, basePrice + toppingBaseAdjust(pricing) + toppings) * 100) / 100;
    }

    if (flat > 0 && chargeLines.length && !opts.suppressPricingNote) {
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

  if (unresolved.length) return { line: null, readBack: "", pricingNote, unresolved, lineSubtotal: null };

  const quantity = Math.max(1, Math.min(99, Math.floor(Number(intent.quantity) || 1)));
  if (lineSubtotal == null) lineSubtotal = variant ? variant.price : item.price;
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
    lineSubtotal: Math.round(lineSubtotal * quantity * 100) / 100,
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

  if (combo.isSoldOut) {
    return { line: null, readBack: "", pricingNote: null, unresolved: [`"${combo.name}" is sold out.`] };
  }

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
      unresolved.push(
        combo.choicesTruncated
          ? // We only loaded part of the eligible list, so "not a choice" may be
            // a lie. Never tell a caller the store doesn't sell something it does.
            `I can't confirm that goes in the ${combo.name}. Check with the kitchen or transfer the caller rather than refusing it.`
          : `That isn't one of the choices for ${combo.name}.`,
      );
      continue;
    }
    const slot = combo.slots[slotIndex];
    const child = slot.choices.find((c) => c.menuItemId === pick.menuItemId)!;
    fill[slotIndex] += 1;

    // A pizza child goes through the SAME pizza compiler, so half/half,
    // per-unit expansion and preset seeding behave identically inside a combo.
    if (child.pizzaConfig) {
      const sub = compilePizzaLine(
        {
          menuItemId: child.menuItemId,
          size: pick.size,
          toppings: pick.toppings,
          crust: pick.crust,
          sauce: pick.sauce,
          cheese: pick.cheese,
          notes: pick.notes,
        },
        child,
        {
          ...opts,
          // A combo child's toppings are priced by combo-child-pricing and the
          // shared pool — never by the standalone engine. Quoting the
          // standalone number announces extras the combo won't charge.
          suppressPricingNote: true,
        },
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
    return { line: null, readBack: "", pricingNote: null, unresolved };
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
    // A combo quotes NO advisory extras. Its money comes from the combo
    // engine (upcharges, extrasCharge, the shared topping pool) and the only
    // honest number is the dryRun total from quote_order.
    pricingNote: null,
    unresolved: [],
  };
}
