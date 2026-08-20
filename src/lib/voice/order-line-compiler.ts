/**
 * Voice order-line COMPILER — turns a spoken *intent* into the exact
 * `/api/orders` wire payload for a simple item, a pizza or a combo.
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

import { comboUpchargeFor } from "@/lib/combo";
import type { PizzaConfig } from "@/lib/pizza-config-parse";
import {
  priceToppingLines,
  toppingBaseAdjust,
  type ToppingChargeLine,
  type ToppingPricingConfig,
} from "@/lib/pizza-topping-pricing";
import { lowerName, spokenCombo, spokenItem, spokenPizza } from "./spoken-line";

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
  /** "Half Philly Steak, half Deluxe" on a build pizza — a HALF (or the whole)
   *  built to the RECIPE of a named pizza. The compiler expands that pizza's
   *  preset toppings onto the side, merges anything both sides share onto the
   *  whole pizza (no "double" question), carries the recipe's base sauce as a
   *  kitchen note when it differs from this pizza's, and reads it back by name.
   *  Needs `opts.recipes[menuItemId]` (build-line-core loads them). */
  halfRecipes?: Array<{ placement: Placement; menuItemId: string }>;
  /** Preset toppings the caller wants LEFT OFF ("Hawaiian, no ham"). Matched
   *  against the pizza's configured presets; a name that isn't a preset comes
   *  back as a notice, never as a refusal. */
  excludeToppings?: string[];
};

/** What the model says the caller asked for on one SIMPLE (non-pizza) item —
 *  a salad, wings, a drink. Options are spoken names resolved across every
 *  modifier group the item carries. */
export type ItemIntent = {
  menuItemId: string;
  quantity?: number;
  size?: string | null;
  options?: string[];
  notes?: string | null;
};

/** Options every compile entry point accepts. */
export type CompileOpts = {
  /** Group ids the STORE wants always confirmed aloud (VoiceAgentConfig.pizzaAskGroups). */
  askGroupIds?: string[];
  currency?: string;
  /** Combo children only. A child is NOT priced by the standalone engine —
   *  combo-child-pricing / the shared topping pool decide, and
   *  `extrasCharge:false` means the extras are free. Quoting the standalone
   *  number there announces money the caller will never be charged.
   *  Suppresses ONLY the spoken `pricingNote`; `surcharge` is still computed,
   *  because compileComboLine needs the raw number to disclose per-pizza
   *  extras on combos that DO charge them. */
  suppressPricingNote?: boolean;
  /** Recipe pizzas referenced by `halfRecipes` (theirs and every pick's), by menuItemId. */
  recipes?: Record<string, ItemData>;
};

export type ComboIntent = {
  menuItemId: string;
  /** One entry per slot pick, in slot order. A pizza pick carries its own
   *  size, toppings AND crust/sauce/cheese — without those a caller who says
   *  "the Family Deal with a thin-crust pepperoni" had nowhere to put "thin
   *  crust", and a store that forces crust to be asked deadlocked the call. */
  picks: Array<{
    menuItemId: string;
    /** Which slot this pick is for, by the slot's label (case-insensitive).
     *  Honoured when that slot has room and lists the item; otherwise the
     *  server's first-fit rule applies, exactly as before. */
    slotLabel?: string;
    size?: string | null;
    toppings?: PizzaIntent["toppings"];
    excludeToppings?: string[];
    /** See PizzaIntent.halfRecipes. */
    halfRecipes?: Array<{ placement: Placement; menuItemId: string }>;
    crust?: string | null;
    sauce?: string | null;
    cheese?: string | null;
    /** Non-pizza picks: spoken option names (dip, sauce, dressing…). */
    options?: string[];
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
  /** Premium-pick money from the combo's config, by item id and by
   *  `itemId::variantId` — the SAME records `comboUpchargeFor` reads on the
   *  charge path. Optional so older sim snapshots keep working; absent = 0. */
  upcharges?: Record<string, number>;
  variantUpcharges?: Record<string, number>;
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
  /** The TICKET string — exact item name, "left half: …; right half: …". Used
   *  by the STATE block, the timeline and tests. NOT what the agent says. */
  readBack: string;
  /** What a person would SAY for this line ("a large pizza, half pepperoni and
   *  mushrooms, half green peppers and onions") — see spoken-line.ts. Empty
   *  when the line did not compile. */
  spoken: string;
  /** `spoken` without the leading quantity word — how a combo names its
   *  children ("first pizza large, half …"). */
  spokenNoQty?: string;
  /** Raw over-allowance money for the caller of this compiler to phrase (the
   *  voice service speaks it in words and only above a threshold). Null when
   *  the line is at list price or not priced here (combos). */
  surcharge?: { amount: number; direction: "extra" | "less" } | null;
  /** Money the caller should hear BEFORE confirming (Luigi 2026-08-10:
   *  always announce the over-allowance charge). Null when nothing to say. */
  pricingNote: string | null;
  /** Things the agent must ask about. Non-empty ⇒ do NOT place the order. */
  unresolved: string[];
  /** What is on each half, read off the COMPILED modifiers — so a spoken
   *  confirmation built from this describes the pizza the kitchen will make,
   *  not the one the model remembers. Null unless the pizza is split. */
  halves?: { left: string[]; right: string[]; whole: string[] } | null;
  /** What this line costs, computed with the SAME pure engine the order route
   *  charges with (base + toppingBaseAdjust + Σ priceToppingLines) × quantity.
   *  Used to compare a pizza against a cheaper same-day deal without asking the
   *  model to do arithmetic. Null when the line didn't compile. */
  lineSubtotal?: number | null;
  /** Things worth SAYING that do not block the order — "Onions wasn't on this
   *  pizza to begin with", "Caesar Salad comes in one size". Never a question. */
  notices?: string[];
  /** Pizza only: one entry per REQUESTED topping that resolved, so the agent
   *  can see what each spoken word became without re-parsing the modifiers. */
  toppings?: Array<{ spoken: string; resolved: string; placement: Placement; count: number }>;
  /** Combo only: which slot each pick landed in. `index` is the pick's
   *  position in `intent.picks`; picks that landed nowhere are absent here and
   *  explained in `unresolved`. */
  pickSlots?: Array<{ index: number; slotId: string; slotLabel: string }>;
  /** Pizza only: names of the recipe pizzas used by halfRecipes (aliases, state). */
  recipeNames?: string[];
  /** Combo only: advisory per-unit money the combo engine WILL book — slot
   *  premium upcharges (booked unconditionally by the route) and, on
   *  per-pizza-allowance combos with `extrasCharge` on, each pizza child's
   *  over-allowance topping money. Pool combos (`sharedToppings` ≥ 1) list no
   *  extras — allocation decides those, so the dryRun quote stays the only
   *  honest number there. The voice service phrases these for the caller. */
  priceParts?: Array<{ label: string; amount: number; kind: "slot_upcharge" | "child_extras" }>;
};

/* ───────────────────────────── name matching ───────────────────────────── */

/** Spoken text → comparable key. STT gives us "extra cheese", the menu says
 *  "Extra Cheese"; punctuation and plurals are noise. */
const norm = (s: string): string =>
  applySpokenAliases(
    s
      .toLowerCase()
      // "jalapeño" must not become "jalape o": fold accents before stripping.
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      // Menus abbreviate "extra" as a lone "X" ("X - Cheese", "X Large") while
      // callers say the word. Same key for both — "extra cheese" must find
      // "X - Cheese", the single most common request there is. Mirrored in
      // services/nabil-voice/src/fuzzy.ts (parity test).
      .replace(/\bx\b/g, "extra")
      // "HG Mixed" ↔ "honey garlic mixed" — the abbreviation wing menus use.
      .replace(/\bhg\b/g, "honey garlic"),
  );

/**
 * SPOKEN-ALIAS DICTIONARY (directive: "green pepper / green peppers / GP must
 * resolve to the SAME modifier"). Store-agnostic pizzeria shorthand mapped to
 * the words menus actually print, applied inside `norm` so every matcher —
 * item search, topping/option resolution, cart target aliases — sees one key.
 * Kept deliberately small and unambiguous; per-store aliases belong in menu
 * data, not here. MIRRORED VERBATIM in services/nabil-voice/src/fuzzy.ts
 * (fuzzy-parity.test.ts pins both).
 */
const SPOKEN_ALIASES: Array<[RegExp, string]> = [
  [/\bgp\b/g, "green pepper"],
  [/\bpeps?\b/g, "pepperoni"],
  [/\b(?:shrooms?|mush)\b/g, "mushroom"],
  [/\bdouble cheese\b/g, "extra cheese"],
  [/\bbarbecue\b/g, "bbq"],
  [/\bveggies?\b/g, "vegetable"],
  [/\bmeat ?lovers?\b/g, "meat lover"],
  [/\bmargarita\b/g, "margherita"],
  [/\bjalapenos?\b/g, "jalapeno"],
  [/\broasted red peppers?\b/g, "roasted red pepper"],
  [/\bcoke zero\b/g, "coke zero"],
];
function applySpokenAliases(s: string): string {
  let out = s;
  for (const [re, to] of SPOKEN_ALIASES) out = out.replace(re, to);
  return out;
}

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

export type CrossGroupMatch =
  | { ok: true; group: GroupData; option: OptionData }
  | { ok: false; reason: "ambiguous_group" | "negated" | "no_match"; suggestions: string[] };

/**
 * Resolve one spoken option name across ALL of an item's groups, and say
 * WHICH group it landed in — a simple item's options are not role-tagged the
 * way a pizza's are, so "ranch" may legitimately live in both "Dips" and
 * "Salad Dressing". Matching group-by-group first means a store whose Dips
 * and Sauces both list "Ranch" gets a real question ("Ranch (Dips) or Ranch
 * (Sauces)?") instead of a within-pool ambiguity with no way out.
 */
export function matchOptionAcrossGroups(spoken: string, groups: GroupData[]): CrossGroupMatch {
  const hits: Array<{ group: GroupData; option: OptionData }> = [];
  for (const g of groups) {
    if (!g.options.length) continue;
    const m = matchOption(spoken, [g]);
    if (m.ok) hits.push({ group: g, option: m.option });
  }
  if (hits.length === 1) return { ok: true, group: hits[0].group, option: hits[0].option };
  if (hits.length > 1) {
    return {
      ok: false,
      reason: "ambiguous_group",
      suggestions: hits.map((h) => `${h.option.name} (${h.group.name})`),
    };
  }
  // No group claimed it on its own — reuse the pooled matcher for its reason
  // and its "did you mean" list.
  const pooled = matchOption(spoken, groups);
  if (pooled.ok) {
    // Cannot happen in practice (a pooled hit is a hit inside some group), but
    // never throw away a real answer if it does.
    const group = groups.find((g) => g.options.some((o) => o.modifierOptionId === pooled.option.modifierOptionId));
    if (group) return { ok: true, group, option: pooled.option };
  }
  if (!pooled.ok && pooled.reason === "negated") return { ok: false, reason: "negated", suggestions: [] };
  const suggestions = pooled.ok ? [] : pooled.suggestions;
  return {
    ok: false,
    reason: !pooled.ok && pooled.reason === "ambiguous" ? "ambiguous_group" : "no_match",
    suggestions,
  };
}

/* ─────────────────────── shared compile building blocks ─────────────────── */

/**
 * 🚨 SIZE IS SOMETIMES THE ITEM, NOT AN OPTION ON IT.
 *
 * On menus like Luigi's, "Large 1 Topping" ($17.74) and "EXTRA Large 1
 * Topping" ($21.99) are two SEPARATE MenuItems with no variants at all — so
 * there is nothing to resolve a spoken size against. Before this rule existed
 * a spoken size on such an item was read off the wire and SILENTLY DISCARDED:
 * nothing landed in `unresolved`, add_pizza answered `ok`, and the line
 * compiled at the wrong size.
 *
 * On 2026-08-14 a caller asked for extra large three times, the agent noticed
 * and correctly called revise_line({size:"extra large"}) — which recompiled
 * straight back through this same hole and returned `ok` AGAIN. The agent then
 * told the caller "that's confirmed, we do have extra large available" because
 * its tools had twice reported success. It wasn't inventing; it was
 * misinformed. A Large went to the kitchen.
 *
 * Fail CLOSED: if the caller named a size this item cannot express, say so and
 * let the agent ask. Only recognised size words are rejected — a freeform note
 * like "12 inch" must not dead-end a caller — and BOTH sides must be
 * recognisable: an item whose name carries no size ("Build Your Own Pizza")
 * tells us nothing, and refusing on a hunch would dead-end a caller for no
 * reason. Returns the message for `unresolved`, or null when there is no
 * conflict.
 */
function sizeIsTheItemConflict(spokenSize: string | null | undefined, itemName: string): string | null {
  const want = normalizeSizeToken(spokenSize);
  const itemSize = normalizeSizeToken(itemName);
  if (want && itemSize && itemSize !== want) {
    return (
      `"${itemName}" IS the ${itemSize} one — on this menu each size is a SEPARATE item, not an option. ` +
      `Find the ${want} version with get_item_options and build that item instead. Do not tell the caller ` +
      `the size is set until you have.`
    );
  }
  return null;
}

/**
 * Fill ONE required group the caller said nothing about, or ask.
 *
 * A pizza's required groups are not only crust/sauce/cheese: Luigi's carry a
 * required "Cook Level" with no pizzaRole at all, and a simple item's are all
 * like that. The web builder applies its default; the phone path used to skip
 * them entirely, so the same order produced a DIFFERENT kitchen ticket
 * depending on where it came from. Fill the store's own default, ask when
 * there is a real choice and no default, and never invent an optional extra.
 *
 * ⚠️ A default is only safe when the store actually marked one, or there is
 * only one choice. "Whatever sorts first" once sold a $4 stuffed crust the
 * caller never asked for and never heard. A default that COSTS money is spoken
 * — silence plus a surcharge is how a caller gets surprised at pickup.
 *
 * @param chosenIds Option ids already on the line. A group the caller already
 *   satisfied is left alone.
 * @param ask Group ids the store wants confirmed aloud, default or not.
 */
function fillRequiredGroup(
  g: GroupData,
  chosenIds: Set<string>,
  ask: Set<string>,
  out: { mods: CompiledModifier[]; spokenParts: string[]; unresolved: string[] },
): void {
  if (!(g.required || g.minSelect > 0) || !g.options.length) return;
  const need = Math.max(g.minSelect, g.required ? 1 : 0);
  const have = g.options.filter((o) => chosenIds.has(o.modifierOptionId)).length;
  if (have >= need) return;
  const optionNames = () => g.options.map((o) => o.name).join(", ");
  // A group whose NAME is already a question ("How would you like them?")
  // is asked as written; "Which How would you like them??" is what the model
  // used to be handed (Luigi's wings, 2026-08-15).
  const question = /\?\s*$/.test(g.name.trim()) ? `${g.name.trim()} ${optionNames()}.` : `Which ${g.name}? ${optionNames()}.`;
  if (ask.has(g.id)) {
    out.unresolved.push(question);
    return;
  }
  const def =
    g.options.find((o) => o.isDefault && !chosenIds.has(o.modifierOptionId)) ??
    (g.options.length === 1 && !chosenIds.has(g.options[0].modifierOptionId) ? g.options[0] : null);
  if (!def) {
    out.unresolved.push(question);
    return;
  }
  out.mods.push({ modifierOptionId: def.modifierOptionId, name: def.name });
  chosenIds.add(def.modifierOptionId);
  if ((Number(def.priceAdjustment) || 0) > 0) out.spokenParts.push(def.name);
}

/** "no onions" / "without the ham" / "hold ham" → "onions" / "ham" / "ham".
 *  Exclusions arrive as topping NAMES, but a model that copies the caller's
 *  words verbatim would otherwise trip the negation guard on the very thing
 *  it is trying to leave off. */
const stripLeadingNegation = (s: string): string =>
  norm(s)
    .replace(/^(no|not|non|without|w o|hold|skip|omit|remove|minus|less|lose|leave off|leave out|none|zero|free of|allergic to)\s+/, "")
    .replace(/^(the|any|of)\s+/, "")
    .trim();

/** Size words that make a spoken size a DIFFERENT size from the menu one.
 *  "extra large" must never quietly become "Large". */
const SIZE_MODIFIERS = new Set([
  "extra", "x", "xl", "xxl", "jumbo", "giant", "super", "mega", "family", "party",
  "mini", "personal", "kids", "half", "double",
]);

/**
 * The size a string is talking about, as a canonical token — for menus where
 * size is baked into the ITEM NAME rather than offered as a variant
 * ("EXTRA Large 1 Topping" vs "Large 1 Topping" are two separate MenuItems).
 *
 * Returns null when the text names no size we recognise. That is deliberate and
 * load-bearing: the caller in `compilePizzaLine` only REFUSES when it can name
 * the size, so a freeform "12 inch" or "the usual" passes through untouched
 * rather than dead-ending someone.
 *
 * 🚨 Longest match first. "extra large" contains "large", so testing "large"
 * first would classify every extra-large as large — which is precisely the
 * mistake this function exists to catch.
 */
export function normalizeSizeToken(text: string | null | undefined): string | null {
  return splitSizeToken(text).token;
}

/** Ordered longest/most-specific first — "extra large" must be tested before
 *  "large", or every extra-large is classified as large. */
const SIZE_PATTERNS: Array<[string, RegExp]> = [
  ["extra large", /\b(extra\s*large|x\s*-?\s*large|xl|xxl)\b/],
  ["large", /\blarge\b/],
  ["medium", /\b(medium|med)\b/],
  ["small", /\bsmall\b/],
  ["personal", /\b(personal|mini)\b/],
  ["party", /\bparty\b/],
];

/**
 * The size a string names, AND what is left of it once the size is removed.
 *
 * The remainder is what makes a size family knowable without guessing: two
 * items whose names differ ONLY by their size token are the same product in two
 * sizes. "Large 1 Topping" and "EXTRA Large 1 Topping" both leave "1 topping".
 * "Large 1 Topping" and "Medium 2 Topping" leave "1 topping" and "2 topping",
 * so they are correctly NOT a pair.
 *
 * That is a much stronger test than name similarity, which is how a caller who
 * asked for a Large ends up with a Medium.
 */
export function splitSizeToken(text: string | null | undefined): { token: string | null; rest: string } {
  const t = norm(text ?? "");
  if (!t) return { token: null, rest: "" };
  for (const [token, re] of SIZE_PATTERNS) {
    if (re.test(t)) {
      return { token, rest: t.replace(re, " ").replace(/\s+/g, " ").trim() };
    }
  }
  return { token: null, rest: t };
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
  if (partial.length === 1) return partial[0];

  // 🚨 LAST RESORT: compare SIZES, not strings.
  //
  // Everything above is substring matching, which cannot cope with a variant
  // named for its dimensions. On "Build Your Own Pizza" — the one pizza on
  // Luigi's menu where size IS a variant — the real names are "Large (10 Slice
  // - 14 inch)" and "X Large (12 Slice - 18 inch)", and the result was that
  // the item could not be ordered by voice AT ANY SIZE:
  //
  //   "extra large" → matches neither name → null
  //   "large"       → substring of BOTH    → partial.length === 2 → null
  //
  // So a caller asking for an extra large was told we don't offer it, on the
  // very item that does (2026-08-14). `normalizeSizeToken` already maps both
  // "extra large" and "X Large (12 Slice - 18 inch)" onto one token; it was
  // simply never consulted here.
  //
  // Still fails closed: only ONE variant may claim the size. If two do, the
  // menu is ambiguous and a human should decide, not this function.
  const wantToken = normalizeSizeToken(spoken);
  if (!wantToken) return null;
  const byToken = variants.filter((v) => normalizeSizeToken(v.name) === wantToken);
  return byToken.length === 1 ? byToken[0] : null;
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
/** Same spoken name (norm / stem) — for merging recipe toppings with spoken ones. */
const sameSpokenName = (a: string, b: string): boolean => norm(a) === norm(b) || stem(a) === stem(b);

/** The option a group falls to by default (isDefault, or the only choice); null when a store didn't mark one. */
function defaultOptionName(groups: GroupData[]): string | null {
  const pool = groups.flatMap((g) => g.options);
  const def = pool.find((o) => o.isDefault) ?? (pool.length === 1 ? pool[0] : null);
  return def ? def.name : null;
}

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
  opts: CompileOpts = {},
): CompileResult {
  const unresolved: string[] = [];
  const notices: string[] = [];
  const currency = opts.currency ?? "usd";
  const ask = new Set(opts.askGroupIds ?? []);
  const cfg = item.pizzaConfig;

  if (item.isSoldOut) {
    return { line: null, readBack: "", spoken: "", pricingNote: null, unresolved: [`"${item.name}" is sold out.`] };
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
  } else if (intent.size) {
    // Size may be the ITEM, not an option on it — see sizeIsTheItemConflict.
    const conflict = sizeIsTheItemConflict(intent.size, item.name);
    if (conflict) unresolved.push(conflict);
  }

  const tGroups = toppingGroups(item);
  // ── half recipes: "half Philly Steak, half Deluxe" ─────────────────────
  // Expand each named pizza's presets onto its side. Anything on BOTH sides
  // (from either recipe, or a recipe and a spoken topping) is one whole-pizza
  // topping — that is what "on both halves" means, never a double.
  const requested: Array<{ name: string; placement?: Placement; count?: number; fromRecipe?: string }> = (intent.toppings ?? []).map((t) => ({ ...t }));
  const recipeNames: string[] = [];
  const recipeSauceNotes: string[] = [];
  const spokenRecipeBySide: { left?: string; right?: string; whole?: string } = {};
  const excludeSet = new Set((intent.excludeToppings ?? []).map((x) => norm(stripLeadingNegation(String(x ?? "")) || String(x ?? ""))));
  // Recipe presets an exclusion DID take off, by norm/stem key → the recipe's
  // side. Read below so "no tomato on the veggie half" (a) is not reported as
  // "wasn't on this pizza to begin with" and (b) is not called a contradiction
  // when the caller ALSO wants tomatoes on the OTHER half — that is exactly
  // "tomatoes on the cheese half only". (2026-08-16, cmsw4s0mz.)
  const recipeExcluded = new Map<string, Placement>();
  const recipeSauceBySide: Array<{ side: Placement; recipe: string; sauce: string }> = [];
  for (const hr of intent.halfRecipes ?? []) {
    const recipe = opts.recipes?.[String(hr?.menuItemId ?? "")];
    const side: Placement = hr?.placement === "left" || hr?.placement === "right" ? hr.placement : "whole";
    if (!recipe || !recipe.pizzaConfig) {
      unresolved.push(`I don't have the recipe for that named pizza (${hr?.menuItemId ?? "?"}) — use get_item_options on it and send its toppings, or ask the caller.`);
      continue;
    }
    recipeNames.push(recipe.name);
    spokenRecipeBySide[side] = recipe.name;
    for (const preset of recipe.pizzaConfig.presetToppings ?? []) {
      const pName = String(preset ?? "").trim();
      if (!pName) continue;
      if (excludeSet.has(norm(pName)) || excludeSet.has(stem(pName))) {
        // "no pineapple on the Hawaiian half"
        recipeExcluded.set(norm(pName), side);
        recipeExcluded.set(stem(pName), side);
        continue;
      }
      const already = requested.find((t) => sameSpokenName(t.name, pName));
      if (already) {
        // On the other side (or spoken for one side while the recipe wants it here) ⇒ whole.
        if (already.placement !== side && already.placement !== "whole") already.placement = "whole";
        continue;
      }
      requested.push({ name: pName, placement: side, fromRecipe: recipe.name });
    }
    // The recipe's base sauce, when it is not what THIS pizza would get by
    // default, rides as a kitchen note for that half (sauce is a whole-pizza
    // group on the ticket; the kitchen sauces halves from the note).
    const rSauce = defaultOptionName(groupsForRole(recipe, "sauce"));
    const mySauce = intent.sauce ? null : defaultOptionName(groupsForRole(item, "sauce"));
    if (rSauce && !intent.sauce && rSauce !== mySauce) recipeSauceBySide.push({ side, recipe: recipe.name, sauce: rSauce });
  }
  // A recipe on the WHOLE pizza with its own base sauce simply sets the sauce.
  // A recipe on a HALF with a different sauce becomes a prefixed modifier —
  // "(L.H) Ranch Base" — so the kitchen sees it grouped with the half's
  // toppings instead of buried in free-text notes.
  let recipeWholeSauce: string | null = null;
  const perHalfSauces: Array<{ side: Placement; sauceName: string }> = [];
  for (const r of recipeSauceBySide) {
    if (r.side === "whole") recipeWholeSauce = r.sauce;
    else perHalfSauces.push({ side: r.side, sauceName: r.sauce });
  }
  if (perHalfSauces.length > 0) {
    const pizzaDefaultSauce = defaultOptionName(groupsForRole(item, "sauce"));
    const coveredSides = new Set(perHalfSauces.map((p) => p.side));
    for (const side of ["left", "right"] as const) {
      if (!coveredSides.has(side) && pizzaDefaultSauce) {
        perHalfSauces.push({ side, sauceName: pizzaDefaultSauce });
      }
    }
  }
  const perHalfSauceResolved: Array<{ side: Placement; name: string }> = [];
  // Two recipes that share a topping ⇒ whole (dedupe by name across sides).
  for (let a = 0; a < requested.length; a++) {
    for (let b = requested.length - 1; b > a; b--) {
      if (sameSpokenName(requested[a].name, requested[b].name) && requested[a].placement !== requested[b].placement && requested[a].placement !== "whole" && requested[b].placement !== "whole") {
        requested[a].placement = "whole";
        requested.splice(b, 1);
      }
    }
  }
  const isHalfHalf = requested.some((t) => t.placement === "left" || t.placement === "right");

  const mods: CompiledModifier[] = [];
  const spokenParts: string[] = [];
  // Words for the SPOKEN line that are not toppings — a chosen crust ("thin
  // crust"), a priced default, a cook level. Kept apart from spokenParts so the
  // ticket read-back is byte-identical to before and the spoken form can put
  // them after the toppings.
  const spokenOptions: string[] = [];
  const speakRole = (role: "crust" | "sauce" | "cheese", name: string): string => {
    const w = lowerName(name);
    if (role === "crust" && !/crust/i.test(w)) return `${w} crust`;
    if (role === "sauce" && !/sauce|base/i.test(w)) return `${w} sauce`;
    if (role === "cheese" && !/cheese/i.test(w)) return `${w} cheese`;
    return w;
  };

  // ── crust / sauce / cheese: smart default, unless the store says ask ───
  for (const role of ["crust", "sauce", "cheese"] as const) {
    const groups = groupsForRole(item, role);
    if (!groups.length) continue;
    const spoken = role === "sauce" ? (intent.sauce ?? recipeWholeSauce) : intent[role];
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
      // A caller-chosen crust/sauce/cheese is part of what they hear back —
      // a default one is not (it is the standard pizza).
      spokenOptions.push(speakRole(role, m.option.name));
      continue;
    }

    if (role === "sauce" && perHalfSauces.length > 0) {
      for (const hs of perHalfSauces) {
        const m = matchOption(hs.sauceName, groups);
        if (m.ok) {
          mods.push({ modifierOptionId: m.option.modifierOptionId, name: `${placementPrefix(hs.side, true)}${m.option.name}` });
          perHalfSauceResolved.push({ side: hs.side, name: m.option.name });
        }
      }
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
    if ((Number(def.priceAdjustment) || 0) > 0) {
      spokenParts.push(def.name);
      spokenOptions.push(speakRole(role, def.name));
    }
  }

  // ── every OTHER required group (cook level, size-of-fries, …) ─────────
  // A pizza's required groups are not only crust/sauce/cheese: Luigi's carry a
  // required "Cook Level" with no pizzaRole at all. Same rule as a simple
  // item's groups — see fillRequiredGroup.
  const roleGroupIds = new Set(
    (["crust", "sauce", "cheese"] as const).flatMap((r) => groupsForRole(item, r).map((g) => g.id)),
  );
  {
    const chosenIds = new Set(mods.map((m) => m.modifierOptionId));
    const otherSpoken: string[] = [];
    const out = { mods, spokenParts: otherSpoken, unresolved };
    for (const g of item.modifierGroups) {
      if (roleGroupIds.has(g.id) || isToppingRole(g.pizzaRole) || g.pizzaRole === "garnish") continue;
      if (toppingGroups(item).some((t) => t.id === g.id)) continue;
      fillRequiredGroup(g, chosenIds, ask, out);
    }
    spokenParts.push(...otherSpoken);
    spokenOptions.push(...otherSpoken.map(lowerName));
  }

  // ── toppings ──────────────────────────────────────────────────────────

  if (isHalfHalf && cfg && cfg.allowHalfHalf === false) {
    unresolved.push(`${item.name} can't be split into halves.`);
  }

  const chargeLines: ToppingChargeLine[] = [];
  const toppingsOut: NonNullable<CompileResult["toppings"]> = [];
  /** "placement|OptionName" of toppings/sauces that came from a half recipe (not spoken by name). */
  const recipeDerived = new Set<string>();
  for (const hs of perHalfSauceResolved) recipeDerived.add(`${hs.side}|${hs.name}`);
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
    // 🚨 ON A SPLIT PIZZA, "WHICH HALF" IS NOT A DEFAULT — IT IS THE ORDER.
    //
    // `?? "whole"` used to guess here, BELOW the model, where no prompt could
    // reach it. On a half-and-half pizza that guess spreads a topping across a
    // side the caller explicitly rejected AND doubles its charge (a whole
    // topping bills $2.75 where a half bills $1.38). Fail closed and ask.
    //
    // Deliberately duplicated with the now-required `placement` field in the
    // voice tool schemas: those two layers deploy separately (Vercel vs Fly)
    // and WILL be out of step, so each has to hold the line on its own.
    if (isHalfHalf && t.placement == null) {
      unresolved.push(
        `Which half for the ${opt.name} — the left, the right, or the whole pizza? Ask before adding it.`,
      );
      continue;
    }
    const placement: Placement = t.placement ?? "whole";
    // The same option on two placements means the kitchen makes it twice and
    // the caller pays twice — almost always a MOVE the caller asked for that
    // was expressed as an add. Ask rather than bill it.
    const clash = mods.find(
      (existing) =>
        existing.modifierOptionId === opt.modifierOptionId &&
        existing.name !== `${placementPrefix(placement, isHalfHalf)}${opt.name}`,
    );
    if (clash) {
      unresolved.push(
        `${opt.name} is already on this pizza as "${clash.name}". Did the caller want it MOVED there, or on both halves ` +
          `(which costs double)? Confirm, then send the full topping list with the placement they want.`,
      );
      continue;
    }
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
    toppingsOut.push({ spoken: t.name, resolved: opt.name, placement, count });
    if (t.fromRecipe) recipeDerived.add(`${placement}|${opt.name}`);
  }

  // ── exclusions: "Hawaiian, no ham" ─────────────────────────────────────
  // Resolved against the topping pool with the SAME matcher the additions use
  // (plurals, typos, phonetics), after stripping the refusal word a verbatim
  // model would carry in ("no ham" → "ham"). Whether the name is actually a
  // preset is decided during seeding below; what matched nothing on the pizza
  // becomes a NOTICE, never a refusal — a caller who says "no anchovies" on a
  // pizza that never had them is not asking a question.
  const excludeIds = new Map<string, string>(); // optionId → spoken form
  const excludeKeys = new Map<string, string>(); // norm/stem key → spoken form
  const excludeMatched = new Map<string, string>(); // spoken form → preset name removed
  for (const raw of intent.excludeToppings ?? []) {
    const spoken = String(raw ?? "").trim();
    if (!spoken) continue;
    const cleaned = stripLeadingNegation(spoken) || norm(spoken);
    const m = matchOption(cleaned, tGroups);
    if (m.ok) excludeIds.set(m.option.modifierOptionId, spoken);
    excludeKeys.set(norm(cleaned), spoken);
    excludeKeys.set(stem(cleaned), spoken);
  }
  const isExcluded = (opt: OptionData, preset: string): string | null =>
    excludeIds.get(opt.modifierOptionId) ??
    excludeKeys.get(norm(opt.name)) ??
    excludeKeys.get(stem(opt.name)) ??
    excludeKeys.get(norm(preset)) ??
    excludeKeys.get(stem(preset)) ??
    null;

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
  const removedPresets: string[] = [];
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
      const excludedAs = isExcluded(opt, preset);
      if (excludedAs !== null) {
        if (already.has(opt.modifierOptionId)) {
          // Named as a topping AND asked to be left off — a contradiction we
          // will not resolve by guessing which one the caller meant.
          unresolved.push(
            `The caller both asked for ${opt.name} and asked to leave it off. Confirm which before adding it.`,
          );
          continue;
        }
        excludeMatched.set(excludedAs, opt.name);
        if (!removedPresets.includes(opt.name)) removedPresets.push(opt.name);
        continue; // leave it off — the kitchen ticket says NO, below
      }
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

  // Exclusions that removed no preset. If the same word also matched a topping
  // the caller ADDED, that is a contradiction to confirm; otherwise it is only
  // worth mentioning — the pizza never had it.
  for (const raw of intent.excludeToppings ?? []) {
    const spoken = String(raw ?? "").trim();
    if (!spoken || excludeMatched.has(spoken)) continue;
    const cleaned = stripLeadingNegation(spoken) || norm(spoken);
    const recipeSide = recipeExcluded.get(norm(cleaned)) ?? recipeExcluded.get(stem(cleaned)) ?? null;
    const addedId = [...excludeIds.entries()].find(([, s]) => s === spoken)?.[0];
    if (addedId && mods.some((m) => m.modifierOptionId === addedId)) {
      // Left off a RECIPE half and asked for on the OTHER half is not a
      // contradiction — it is "tomatoes on the cheese half only". Only the same
      // side (or the whole pizza) contradicts.
      if (recipeSide && recipeSide !== "whole") {
        const conflicting = mods.some((m) => m.modifierOptionId === addedId && !m.name.startsWith(placementPrefix(recipeSide === "left" ? "right" : "left", true)));
        if (!conflicting) continue;
      }
      const name = tGroups.flatMap((g) => g.options).find((o) => o.modifierOptionId === addedId)?.name ?? spoken;
      unresolved.push(`The caller both asked for ${name} and asked to leave it off. Confirm which before adding it.`);
      continue;
    }
    // An exclusion that took a recipe's topping off its half did its job.
    if (recipeSide) continue;
    notices.push(`${spoken} wasn't on this pizza to begin with`);
  }

  // ── advisory topping money (the over-allowance announcement) ───────────
  let pricingNote: string | null = null;
  let surcharge: CompileResult["surcharge"] = null;
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

    if (flat > 0 && chargeLines.length) {
      const charges = priceToppingLines(pricing, chargeLines);
      const toppingTotal = charges.reduce((a, b) => a + b, 0) + toppingBaseAdjust(pricing);
      const extra = Math.round(toppingTotal * 100) / 100;
      const halves = chargeLines.filter((l) => l.isHalf).length;
      const wholes = chargeLines.length - halves;
      const countLabel = `${wholes + halves} topping${wholes + halves === 1 ? "" : "s"}`;
      if (extra > 0) {
        if (!opts.suppressPricingNote) pricingNote = `${countLabel}; ${cfg.includedToppings} included, so that's ${money(extra, currency)} extra.`;
        surcharge = { amount: extra, direction: "extra" };
      } else if (extra < 0) {
        if (!opts.suppressPricingNote) pricingNote = `${countLabel} — that's ${money(Math.abs(extra), currency)} less than the standard build.`;
        surcharge = { amount: Math.abs(extra), direction: "less" };
      }
    }
  }

  if (unresolved.length) {
    return {
      line: null,
      readBack: "",
      spoken: "",
      pricingNote,
      surcharge,
      unresolved,
      lineSubtotal: null,
      ...(notices.length ? { notices } : {}),
      ...(toppingsOut.length ? { toppings: toppingsOut } : {}),
    };
  }

  const quantity = Math.max(1, Math.min(99, Math.floor(Number(intent.quantity) || 1)));
  if (lineSubtotal == null) lineSubtotal = variant ? variant.price : item.price;
  const sizeLabel = variant ? `${variant.name} ` : "";
  // A removed preset is spoken AND written on the ticket — the kitchen must
  // not build the standard pizza because the note went missing.
  const noSuffix = removedPresets.map((n) => `, no ${n}`).join("");
  const noteParts = [intent.notes?.trim() || "", ...removedPresets.map((n) => `NO ${n}`), ...recipeSauceNotes].filter(Boolean);
  const notes = noteParts.length ? noteParts.join("; ") : null;
  for (const n of recipeSauceNotes) spokenOptions.push(lowerName(n));

  // ── what is actually on each half, read off the COMPILED line ────────────
  //
  // Derived from `mods` — the exact strings the kitchen will print — so a
  // read-back built from this cannot drift from the ticket. Null unless the
  // pizza is genuinely split.
  const halves = isHalfHalf ? splitHalves(mods) : null;

  // 🚨 A HALF/HALF READ-BACK MUST BE GROUPED BY SIDE.
  //
  // This used to be one clause per topping — "Pepperoni on the left half,
  // Ground Beef on the right half, Jalapeno on the right half, …" — six
  // near-identical fragments, which is exactly the shape a model regroups
  // wrongly when it compresses. On 2026-08-14 it did: it moved two toppings to
  // the wrong side in its spoken summary, asked one compound five-item
  // question, and a worn-down caller said "Sure. Sure."
  //
  // One clause per SIDE is shorter, and an inverted grouping is audible.
  const sideLabel = (side: "left" | "right") => (spokenRecipeBySide[side] ? `${side} half (${spokenRecipeBySide[side]})` : `${side} half`);
  const readBack = halves
    ? `${quantity > 1 ? `${quantity}× ` : ""}${sizeLabel}${item.name} — ` +
      [
        halves.left.length ? `${sideLabel("left")}: ${halves.left.join(", ")}` : "",
        halves.right.length ? `${sideLabel("right")}: ${halves.right.join(", ")}` : "",
        halves.whole.length ? `all over: ${halves.whole.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ") +
      (recipeSauceNotes.length ? ` (${recipeSauceNotes.join("; ")})` : "") +
      noSuffix
    : `${quantity > 1 ? `${quantity}× ` : ""}${sizeLabel}${item.name}` +
      (spokenParts.length ? ` with ${spokenParts.join(", ")}` : "") +
      noSuffix;

  // The SPOKEN form (spoken-line.ts): toppings by side, options after, no SKU
  // jargon, no punctuation a voice would not say.
  const toppingOptionIds = new Set(tGroups.flatMap((g) => g.options.map((o) => o.modifierOptionId)));
  const wholeToppingNames = halves
    ? []
    : mods.filter((m) => toppingOptionIds.has(m.modifierOptionId) && !recipeDerived.has(`whole|${m.name}`)).map((m) => m.name);
  // For SPEECH a recipe half is named ("half Philly Steak"), not enumerated;
  // only toppings the caller added on top of the recipe are spoken by name.
  const spokenHalves = halves
    ? {
        left: halves.left.filter((n) => !recipeDerived.has(`left|${n}`)),
        right: halves.right.filter((n) => !recipeDerived.has(`right|${n}`)),
        whole: halves.whole.filter((n) => !recipeDerived.has(`whole|${n}`)),
      }
    : null;
  const spokenArgs = {
    quantity,
    itemName: item.name,
    variantName: variant?.name ?? null,
    halves: spokenHalves,
    recipes: spokenRecipeBySide,
    toppings: wholeToppingNames,
    options: spokenOptions,
    removed: removedPresets,
  };
  const spoken = spokenPizza(spokenArgs);
  const spokenNoQty = spokenPizza({ ...spokenArgs, omitQuantity: true });

  return {
    line: {
      menuItemId: item.menuItemId,
      variantId: variant?.variantId ?? null,
      quantity,
      modifiers: mods,
      notes,
    },
    readBack,
    spoken,
    spokenNoQty,
    halves,
    pricingNote,
    surcharge,
    ...(recipeNames.length ? { recipeNames } : {}),
    unresolved: [],
    lineSubtotal: Math.round(lineSubtotal * quantity * 100) / 100,
    ...(notices.length ? { notices } : {}),
    ...(toppingsOut.length ? { toppings: toppingsOut } : {}),
  };
}

/**
 * Group compiled modifier names by which half they are on.
 *
 * Reads the SAME "(L.H) " / "(R.H) " / "(W) " prefixes the kitchen ticket
 * carries, so anything built from this describes the real pizza. Base
 * selections (crust, sauce, cheese) carry no prefix and are excluded — the
 * caller is being asked about toppings.
 */
export function splitHalves(mods: CompiledModifier[]): { left: string[]; right: string[]; whole: string[] } {
  const out = { left: [] as string[], right: [] as string[], whole: [] as string[] };
  for (const m of mods) {
    if (m.name.startsWith("(L.H) ")) out.left.push(m.name.slice(6));
    else if (m.name.startsWith("(R.H) ")) out.right.push(m.name.slice(6));
    else if (m.name.startsWith("(W) ")) out.whole.push(m.name.slice(4));
  }
  return out;
}

/* ───────────────────────────── item compile ────────────────────────────── */

/** Variant names with their prices, for a "which size?" question the caller
 *  can actually answer. */
const sizeMenu = (variants: VariantData[], currency: string): string =>
  variants.map((v) => `${v.name} (${money(v.price, currency)})`).join(", ");

/**
 * Compile a spoken SIMPLE item — a salad, wings, a drink — into a wire line.
 *
 * Same contract as the pizza compiler: the model states an intent, this
 * resolves it against the item's real variants and modifier groups, and
 * anything it cannot resolve confidently comes back in `unresolved[]`. Sizes
 * are never silently downgraded, options are never guessed, required groups
 * are filled from the store's own default or asked, and an option the caller
 * REFUSED is never added.
 */
export function compileItemLine(intent: ItemIntent, item: ItemData, opts: CompileOpts = {}): CompileResult {
  const unresolved: string[] = [];
  const notices: string[] = [];
  const currency = opts.currency ?? "usd";
  const ask = new Set(opts.askGroupIds ?? []);
  const fail = (): CompileResult => ({
    line: null,
    readBack: "",
      spoken: "",
    pricingNote: null,
    unresolved,
    halves: null,
    lineSubtotal: null,
    ...(notices.length ? { notices } : {}),
  });

  if (item.isSoldOut) {
    unresolved.push(`${item.name} is sold out today.`);
    return fail();
  }

  const mods: CompiledModifier[] = [];
  const spokenParts: string[] = [];
  const chosenIds = new Set<string>();
  let extras = 0;

  // ── size ──────────────────────────────────────────────────────────────
  let variant: VariantData | null = null;
  let sizeHandled = false;
  if (item.hasVariants && item.variants.length) {
    variant = resolveVariant(intent.size, item.variants);
    sizeHandled = true;
    if (!variant) {
      unresolved.push(
        intent.size
          ? `We don't have "${intent.size}" for ${item.name}. Which size? ${sizeMenu(item.variants, currency)}.`
          : `Which size for ${item.name}? ${sizeMenu(item.variants, currency)}.`,
      );
    }
  } else if (intent.size) {
    // Some stores model size as a MODIFIER GROUP ("Size: Small / Large")
    // rather than as variants. A spoken size that resolves inside such a group
    // is simply that choice — not "one size", not a separate item.
    const sizeGroups = item.modifierGroups.filter((g) => /\bsizes?\b/.test(norm(g.name)) && g.options.length);
    for (const g of sizeGroups) {
      const m = matchOption(intent.size, [g]);
      if (!m.ok) continue;
      mods.push({ modifierOptionId: m.option.modifierOptionId, name: m.option.name });
      chosenIds.add(m.option.modifierOptionId);
      spokenParts.push(m.option.name);
      extras += Number(m.option.priceAdjustment) || 0;
      sizeHandled = true;
      break;
    }
    if (!sizeHandled) {
      // Size may be the ITEM, not an option on it — see sizeIsTheItemConflict.
      const conflict = sizeIsTheItemConflict(intent.size, item.name);
      if (conflict) unresolved.push(conflict);
      else if (!normalizeSizeToken(item.name)) notices.push(`${item.name} comes in one size`);
    }
  }

  // ── options, across every group ───────────────────────────────────────
  const countIn = (g: GroupData) => g.options.filter((o) => chosenIds.has(o.modifierOptionId)).length;
  const overfull = new Set<string>();
  for (const raw of intent.options ?? []) {
    const spoken = String(raw ?? "").trim();
    if (!spoken) continue;
    const m = matchOptionAcrossGroups(spoken, item.modifierGroups);
    if (!m.ok) {
      if (m.reason === "negated") {
        unresolved.push(
          `The caller said "${spoken}" — that's something to LEAVE OFF, not add. Only name options they want ON the ${item.name}; a removal goes in notes. Confirm with them if unsure.`,
        );
      } else if (m.reason === "ambiguous_group") {
        unresolved.push(
          m.suggestions.length
            ? `"${spoken}" could be ${m.suggestions.join(" or ")} on ${item.name}. Which one?`
            : `"${spoken}" matches more than one option on ${item.name}. Which one?`,
        );
      } else {
        unresolved.push(
          m.suggestions.length
            ? `I couldn't find "${spoken}" on ${item.name}. Did they mean ${m.suggestions.slice(0, 3).join(", ")}?`
            : `I couldn't find "${spoken}" on ${item.name} — it has no such option; a special request goes in notes.`,
        );
      }
      continue;
    }
    const { group: g, option: opt } = m;
    if (chosenIds.has(opt.modifierOptionId)) continue; // said twice — once is enough
    if (g.maxSelect > 0 && countIn(g) >= g.maxSelect) {
      if (!overfull.has(g.id)) {
        overfull.add(g.id);
        unresolved.push(
          `Only ${g.maxSelect} choice${g.maxSelect === 1 ? "" : "s"} for ${g.name}: ${g.options.map((o) => o.name).join(", ")}.`,
        );
      }
      continue; // the extra is dropped, and the agent asks
    }
    mods.push({ modifierOptionId: opt.modifierOptionId, name: opt.name });
    chosenIds.add(opt.modifierOptionId);
    spokenParts.push(opt.name);
    extras += Number(opt.priceAdjustment) || 0;
  }

  // ── every required group the caller left unsatisfied ──────────────────
  {
    const before = mods.length;
    const out = { mods, spokenParts, unresolved };
    for (const g of item.modifierGroups) fillRequiredGroup(g, chosenIds, ask, out);
    for (const m of mods.slice(before)) {
      const opt = item.modifierGroups.flatMap((g) => g.options).find((o) => o.modifierOptionId === m.modifierOptionId);
      extras += Number(opt?.priceAdjustment) || 0;
    }
  }

  if (unresolved.length) return fail();

  const quantity = Math.max(1, Math.min(50, Math.floor(Number(intent.quantity) || 1)));
  const base = variant ? variant.price : item.price;
  const unit = Math.round((base + extras) * 100) / 100;
  const pricingNote =
    extras > 0 && !opts.suppressPricingNote
      ? `Add-ons come to ${money(Math.round(extras * 100) / 100, currency)} extra.`
      : null;
  const surcharge: CompileResult["surcharge"] =
    extras > 0 ? { amount: Math.round(extras * 100) / 100, direction: "extra" } : null;
  const readBack =
    `${quantity > 1 ? `${quantity}× ` : ""}${variant ? `${variant.name} ` : ""}${item.name}` +
    (spokenParts.length ? ` with ${spokenParts.join(", ")}` : "");
  const spokenArgs = { quantity, itemName: item.name, variantName: variant?.name ?? null, options: spokenParts };
  const spoken = spokenItem(spokenArgs);
  const spokenNoQty = spokenItem({ ...spokenArgs, omitQuantity: true });

  return {
    line: {
      menuItemId: item.menuItemId,
      variantId: variant?.variantId ?? null,
      quantity,
      modifiers: mods,
      notes: intent.notes ?? null,
    },
    readBack,
    spoken,
    spokenNoQty,
    halves: null,
    pricingNote,
    surcharge,
    unresolved: [],
    lineSubtotal: Math.round(unit * quantity * 100) / 100,
    ...(notices.length ? { notices } : {}),
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
  opts: CompileOpts = {},
): CompileResult {
  const unresolved: string[] = [];
  const notices: string[] = [];
  const children: NonNullable<CompiledLine["bundleItems"]> = [];
  const spokenParts: string[] = [];
  const spokenChildren: Array<{ kind: "pizza" | "item"; spokenNoQty: string }> = [];
  const childNotes: string[] = [];
  const pickSlots: NonNullable<CompileResult["pickSlots"]> = [];
  const priceParts: NonNullable<CompileResult["priceParts"]> = [];
  const currency = opts.currency ?? "usd";

  if (combo.isSoldOut) {
    return { line: null, readBack: "", spoken: "", pricingNote: null, unresolved: [`"${combo.name}" is sold out.`] };
  }

  // Assign each pick to the first slot that accepts it and still has room —
  // mirroring the server's greedy first-fit so what we emit is what it books.
  // A pick that NAMES its slot goes there when that slot lists the item and
  // has room ("the wings in the second slot, not the first"); the server
  // books greedily by our emitted order, so a named slot only changes which
  // slot's rules (allowed sizes, min/max) we validate against.
  const fill = combo.slots.map(() => 0);
  const picks = intent.picks ?? [];

  const accepts = (i: number, menuItemId: string): boolean =>
    fill[i] < combo.slots[i].max && combo.slots[i].choices.some((c) => c.menuItemId === menuItemId);

  for (let pickIndex = 0; pickIndex < picks.length; pickIndex++) {
    const pick = picks[pickIndex];
    let slotIndex = -1;
    const wantLabel = typeof pick.slotLabel === "string" ? norm(pick.slotLabel) : "";
    if (wantLabel) {
      for (let i = 0; i < combo.slots.length; i++) {
        if (norm(combo.slots[i].label) === wantLabel && accepts(i, pick.menuItemId)) {
          slotIndex = i;
          break;
        }
      }
    }
    for (let i = 0; slotIndex < 0 && i < combo.slots.length; i++) {
      if (accepts(i, pick.menuItemId)) slotIndex = i;
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
    pickSlots.push({ index: pickIndex, slotId: slot.id, slotLabel: slot.label });

    // A combo child's toppings/options are priced by combo-child-pricing and
    // the shared pool — never by the standalone engine. Quoting the standalone
    // number announces extras the combo won't charge.
    const childOpts: CompileOpts = { ...opts, suppressPricingNote: true };

    // A pizza child goes through the SAME pizza compiler, so half/half,
    // per-unit expansion and preset seeding behave identically inside a combo.
    const sub = child.pizzaConfig
      ? compilePizzaLine(
          {
            menuItemId: child.menuItemId,
            size: pick.size,
            toppings: pick.toppings,
            halfRecipes: pick.halfRecipes,
            excludeToppings: pick.excludeToppings,
            crust: pick.crust,
            sauce: pick.sauce,
            cheese: pick.cheese,
            notes: pick.notes,
          },
          child,
          childOpts,
        )
      : // A non-pizza child goes through the SAME item compiler, so its size,
        // its spoken options and its required groups (dip, dressing, flavour)
        // are resolved or asked exactly as they would be standalone. The wire
        // child shape is unchanged: the server takes id + variant + modifiers.
        compileItemLine(
          { menuItemId: child.menuItemId, size: pick.size, options: pick.options, notes: pick.notes },
          child,
          childOpts,
        );
    if (sub.notices?.length) notices.push(...sub.notices);
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
    // The wire child carries no notes, so a child's note ("NO Ham", "extra
    // crispy") is hoisted onto the combo line — otherwise it never reaches the
    // kitchen at all.
    const childNote = (sub.line.notes ?? "").trim();
    if (childNote) childNotes.push(`${child.name}: ${childNote}`);
    spokenParts.push(sub.readBack);
    spokenChildren.push({ kind: child.pizzaConfig ? "pizza" : "item", spokenNoQty: sub.spokenNoQty || sub.spoken || sub.readBack });

    // Money the caller must hear for THIS pick. The slot premium is resolved
    // with the SAME function the charge path uses (variant key wins, then the
    // per-item entry), on the slot the pick actually LANDED in — first-fit can
    // relocate a pick, and the route books whatever slot it lands in.
    const slotUp = comboUpchargeFor(
      { upcharges: slot.upcharges, variantUpcharges: slot.variantUpcharges } as never,
      child.menuItemId,
      sub.line.variantId,
    );
    if (slotUp > 0) {
      const variantName = sub.line.variantId
        ? (child.variants.find((v) => v.variantId === sub.line!.variantId)?.name ?? null)
        : null;
      const usedVariantKey =
        sub.line.variantId != null &&
        Number.isFinite(slot.variantUpcharges?.[`${child.menuItemId}::${sub.line.variantId}`]);
      priceParts.push({
        label: usedVariantKey && variantName ? `${variantName} ${child.name}` : child.name,
        amount: Math.round(slotUp * 100) / 100,
        kind: "slot_upcharge",
      });
    }
    // A pizza child's over-allowance toppings are billed only when the owner
    // turned extrasCharge on AND there is no shared pool — pool overage is
    // allocation-dependent, so its number stays with quote_order's dryRun.
    if (
      combo.extrasCharge &&
      !(typeof combo.sharedToppings === "number" && combo.sharedToppings >= 1) &&
      sub.surcharge?.direction === "extra" &&
      sub.surcharge.amount > 0
    ) {
      priceParts.push({
        label: child.name,
        amount: sub.surcharge.amount,
        kind: "child_extras",
      });
    }
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
    return {
      line: null,
      readBack: "",
      spoken: "",
      pricingNote: null,
      unresolved,
      ...(notices.length ? { notices } : {}),
      ...(pickSlots.length ? { pickSlots } : {}),
    };
  }

  const quantity = Math.max(1, Math.min(99, Math.floor(Number(intent.quantity) || 1)));
  const notes = childNotes.length
    ? [intent.notes?.trim() || "", ...childNotes].filter(Boolean).join("; ")
    : (intent.notes ?? null);
  const comboUpTotal = Math.round(priceParts.reduce((a, p) => a + p.amount, 0) * 100) / 100;
  return {
    line: {
      menuItemId: combo.menuItemId,
      variantId: null,
      quantity,
      modifiers: [],
      notes,
      isCombo: true,
      bundleItems: children,
    },
    readBack: `${quantity > 1 ? `${quantity}× ` : ""}${combo.name}: ${spokenParts.join(", ")}`,
    spoken: spokenCombo({ quantity, comboName: combo.name, children: spokenChildren }),
    spokenNoQty: spokenCombo({ quantity: 1, comboName: combo.name, children: spokenChildren }).replace(/^a /, ""),
    // Advisory disclosure of the money the combo engine WILL book for these
    // picks (slot premiums always; per-pizza/item extras only when
    // extrasCharge is on and there is no shared pool — see priceParts docs).
    // The binding total is still quote_order's dryRun.
    surcharge: comboUpTotal > 0 ? { amount: comboUpTotal, direction: "extra" } : null,
    pricingNote: comboUpTotal > 0 ? priceParts.map((p) => `${p.label} +${money(p.amount, currency)}`).join(", ") : null,
    unresolved: [],
    ...(notices.length ? { notices } : {}),
    ...(priceParts.length ? { priceParts } : {}),
    pickSlots,
  };
}
