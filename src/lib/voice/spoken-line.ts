/**
 * THE SPOKEN LAYER — how a compiled order line is SAID on the phone.
 *
 * Why this exists (Luigi's first live call on the rebuilt agent, 2026-08-15
 * 17:58 UTC): the cart was exactly right, but the caller heard the KITCHEN
 * TICKET string — "Large 2 Topping — left half: Pepperoni, Mushrooms; right
 * half: Green Peppers, Onions" — read word for word, then "confirm one half
 * at a time". A SKU that says "2 Topping" for a four-topping order, colons and
 * semicolons, capitalised nouns: to a human ear that is a machine that did not
 * understand the pizza. `readBack` stays the exact ticket string (STATE block,
 * timeline, tests). `spoken` is what a person behind the counter would say:
 *
 *   "a large pizza, half pepperoni and mushrooms, half green peppers and onions"
 *   "two large Hawaiian Pizza, no ham, thin crust"
 *   "twenty piece Chicken Wings, hot mixed"
 *   "a Double Large Combo with first pizza large, half pepperoni and pineapple,
 *    half bacon and pineapple, second pizza large with cheese, and two Dipping
 *    Sauce, garlic"
 *
 * Rules the model gets alongside it: say it once, naturally, keep every item,
 * size, topping and half exactly; connective words only. It is deterministic
 * (a pure function of the compiled line), English-only for now — the
 * multilingual read-back is a tracked follow-up — and never contains prices
 * (money is spoken by the tool layer, in words).
 *
 * Pure: no imports, safe on Vercel and copyable to the Fly service.
 */

/* ───────────────────────────── generic build SKUs ─────────────────────── */

const SIZE_WORDS: Array<[RegExp, string]> = [
  [/\b(?:xx-?l|xxl|double\s+extra\s+large)\b/i, "double extra large"],
  [/\b(?:x-?l|xl|extra[- ]?large|x\s+large)\b/i, "extra large"],
  [/\blarge\b/i, "large"],
  [/\bmedium\b/i, "medium"],
  [/\bsmall\b/i, "small"],
  [/\bpersonal\b/i, "personal"],
  [/\bparty\b/i, "party"],
  [/\bjumbo\b/i, "jumbo"],
];

/** A menu name that is a generic BUILD product rather than a recipe — "Large 2
 *  Topping", "LARGE PIZZA - 1 Topping", "Medium Pizza 1 Topping", "Build Your
 *  Own Pizza". Spoken as "<size> pizza"; a recipe ("Hawaiian Pizza") keeps its
 *  name because the name IS the order. */
export function isGenericBuildName(name: string): boolean {
  const n = String(name || "").trim();
  if (!n) return false;
  if (/\bbuild[- ]your[- ]own\b|\bcreate[- ]your[- ]own\b|\bmake[- ]your[- ]own\b/i.test(n)) return true;
  // "<size>? <pizza>? <-> <N|one..five> topping(s)"
  return /^(?:(?:xx?-?l|xl|extra[- ]?large|x\s+large|large|medium|small|personal|party|jumbo)\s*)?(?:pizza\s*)?[-–—]?\s*(?:\d+|one|two|three|four|five|six)\s*[- ]?toppings?\b/i.test(n);
}

/** The size word carried by a menu name ("EXTRA Large 2 Topping" → "extra large"). */
export function sizeWordFromName(name: string): string | null {
  for (const [re, word] of SIZE_WORDS) if (re.test(name)) return word;
  return null;
}

/** "Large (10 Slice - 14 inch)" → "large"; "20 pc" → "20 piece"; "X Large" → "extra large". */
export function spokenVariant(variantName: string | null | undefined, itemName = ""): string | null {
  const raw = String(variantName ?? "").replace(/\([^)]*\)/g, "").trim();
  if (!raw) return null;
  const size = sizeWordFromName(raw);
  if (size && /^(?:xx?-?l|xl|extra[- ]?large|x\s+large|large|medium|small|personal|party|jumbo)$/i.test(raw.replace(/\s+/g, " "))) return size;
  if (/^\d+\s*(?:pc|pcs|piece|pieces)$/i.test(raw)) return `${raw.match(/\d+/)![0]} piece`;
  if (/^\d+$/.test(raw) && /\bwing/i.test(itemName)) return `${raw} piece`;
  return lowerName(raw);
}

/* ─────────────────────────────── word helpers ─────────────────────────── */

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** "a" / "two" / "twelve" / "25". Speech, not arithmetic. */
export function qtyWord(n: number, opts: { article?: boolean } = {}): string {
  const q = Math.max(1, Math.floor(Number(n) || 1));
  if (q === 1) return opts.article === false ? "one" : "a";
  return q < ONES.length ? ONES[q] : String(q);
}

/** Lowercase a menu word for speech, keeping short all-caps tokens ("BBQ"). */
export function lowerName(s: string): string {
  return String(s ?? "")
    .trim()
    .split(/\s+/)
    .map((w) => (/^[A-Z0-9&'.-]{1,3}$/.test(w) && /[A-Z]/.test(w) ? w : w.toLowerCase()))
    .join(" ");
}

export function joinAnd(parts: string[]): string {
  const xs = parts.filter((p) => p && p.trim());
  if (!xs.length) return "";
  if (xs.length === 1) return xs[0];
  if (xs.length === 2) return `${xs[0]} and ${xs[1]}`;
  return `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
}

/** ["Pepperoni","Pepperoni","Mushrooms"] → ["double pepperoni","mushrooms"] */
export function collapseCounts(names: string[]): string[] {
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const n of names) {
    const k = String(n ?? "").trim();
    if (!k) continue;
    if (!counts.has(k)) order.push(k);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return order.map((k) => {
    const c = counts.get(k)!;
    const w = lowerName(k);
    return c === 1 ? w : c === 2 ? `double ${w}` : c === 3 ? `triple ${w}` : `${c} times ${w}`;
  });
}

/* ─────────────────────────────── renderers ────────────────────────────── */

export type SpokenPizzaInput = {
  quantity: number;
  itemName: string;
  variantName?: string | null;
  /** Split pizza: names per side (may repeat for count > 1). Null/undefined = not split. */
  halves?: { left: string[]; right: string[]; whole: string[] } | null;
  /** Whole-pizza toppings when NOT split (may repeat for count > 1). */
  toppings?: string[];
  /** Crust / sauce / cheese / other option words already shaped for speech ("thin crust"). */
  options?: string[];
  /** Presets the caller removed ("Ham"). */
  removed?: string[];
  /** Combo child: no leading "a"/"two". */
  omitQuantity?: boolean;
};

export function spokenPizza(p: SpokenPizzaInput): string {
  const generic = isGenericBuildName(p.itemName);
  const size = spokenVariant(p.variantName, p.itemName) ?? (generic ? sizeWordFromName(p.itemName) : null);
  const head = generic
    ? `${size ? `${size} ` : ""}${p.quantity > 1 && !p.omitQuantity ? "pizzas" : "pizza"}`
    : `${size ? `${size} ` : ""}${p.itemName.trim()}`;
  const parts: string[] = [];
  const each = p.quantity > 1 && !p.omitQuantity ? "each " : "";
  if (p.halves && (p.halves.left.length || p.halves.right.length)) {
    const left = collapseCounts(p.halves.left);
    const right = collapseCounts(p.halves.right);
    const whole = collapseCounts(p.halves.whole);
    const sides: string[] = [];
    if (left.length) sides.push(`half ${joinAnd(left)}`);
    if (right.length) sides.push(`half ${joinAnd(right)}`);
    parts.push(`${each}${sides.join(", ")}`);
    if (whole.length) parts.push(`${joinAnd(whole)} on the whole thing`);
  } else {
    const t = collapseCounts(p.toppings ?? []);
    if (t.length) parts.push(`${each}with ${joinAnd(t)}`);
  }
  if (p.removed?.length) parts.push(`no ${joinAnd(p.removed.map(lowerName))}`);
  if (p.options?.length) parts.push(p.options.join(", "));
  const lead = p.omitQuantity ? head : `${qtyWord(p.quantity)} ${head}`;
  return parts.length ? `${lead}, ${parts.join(", ")}` : lead;
}

export type SpokenItemInput = {
  quantity: number;
  itemName: string;
  variantName?: string | null;
  /** Chosen option names (flavour, dip, pop) — spoken lowercased after the name. */
  options?: string[];
  omitQuantity?: boolean;
};

export function spokenItem(p: SpokenItemInput): string {
  const size = spokenVariant(p.variantName, p.itemName);
  const head = `${size ? `${size} ` : ""}${p.itemName.trim()}`;
  const opts = (p.options ?? []).map(lowerName).filter(Boolean);
  const lead = p.omitQuantity ? head : `${qtyWord(p.quantity)} ${head}`;
  return opts.length ? `${lead}, ${joinAnd(opts)}` : lead;
}

export type SpokenComboInput = {
  quantity: number;
  comboName: string;
  /** Children in slot order, each spoken WITHOUT a quantity word ("large pizza,
   *  half …", "Dipping Sauce, garlic"). Pizza children get "first pizza /
   *  second pizza" labels when there are ≥ 2; identical non-pizza children
   *  collapse to "two Dipping Sauce, garlic". */
  children: Array<{ kind: "pizza" | "item"; spokenNoQty: string }>;
};

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];

export function spokenCombo(p: SpokenComboInput): string {
  const pizzas = p.children.filter((c) => c.kind === "pizza").length;
  let pizzaNo = 0;
  const labelled: string[] = [];
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const c of p.children) {
    if (c.kind === "pizza" && pizzas >= 2) {
      labelled.push(`${ORDINALS[pizzaNo] ?? `number ${pizzaNo + 1}`} pizza ${c.spokenNoQty}`);
      pizzaNo++;
      continue;
    }
    if (!counts.has(c.spokenNoQty)) order.push(c.spokenNoQty);
    counts.set(c.spokenNoQty, (counts.get(c.spokenNoQty) ?? 0) + 1);
  }
  const rest = order.map((t) => `${qtyWord(counts.get(t)!)} ${t}`);
  const lead = `${qtyWord(p.quantity)} ${p.comboName.trim()}`;
  const groups = [...labelled, ...rest];
  return groups.length ? `${lead} with ${joinAnd(groups)}` : lead;
}

/** Whole order for the pre-quote read-back: "So that's X, Y, and Z." */
export function spokenOrder(lines: string[]): string {
  const xs = lines.filter(Boolean);
  if (!xs.length) return "Nothing is on the order yet.";
  return `So that's ${joinAnd(xs)}.`;
}
