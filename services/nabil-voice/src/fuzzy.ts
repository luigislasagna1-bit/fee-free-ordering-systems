/**
 * Fly-side copies of the compiler's private string helpers.
 *
 * The voice service's Docker build context is `services/nabil-voice/` only, so
 * it CANNOT import `src/lib/voice/order-line-compiler.ts`. The cart engine and
 * the menu index still need the same normalisation the compiler uses (a topping
 * the compiler resolved as "Mushroom" must be findable again from "mushrooms"),
 * so the helpers are duplicated here verbatim. `src/lib/voice/fuzzy-parity.test.ts`
 * pins both copies to identical output — change one, and the test tells you to
 * change the other.
 */

/** Spoken text → comparable key. */
export const norm = (s: string): string =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // "X - Cheese" / "X Large" ↔ "extra cheese" / "extra large" (mirrors the compiler).
    .replace(/\bx\b/g, "extra")
    .replace(/\bhg\b/g, "honey garlic");

/** Singular-ish form so "mushrooms" matches "Mushroom". */
export const stem = (s: string): string => norm(s).replace(/e?s$/, "");

/** Cheap phonetic key — enough to bridge the ASR errors phone audio produces. */
export const phonetic = (s: string): string =>
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

/** Levenshtein distance. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** How far off a spoken word may be before we stop guessing. */
export const fuzzyBudget = (len: number): number => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

/** Ordered longest/most-specific first — "extra large" before "large". */
export const SIZE_PATTERNS: Array<[string, RegExp]> = [
  ["extra large", /\b(extra\s*large|x\s*-?\s*large|xl|xxl)\b/],
  ["large", /\blarge\b/],
  ["medium", /\b(medium|med)\b/],
  ["small", /\bsmall\b/],
  ["personal", /\b(personal|mini)\b/],
  ["party", /\bparty\b/],
];

/** The size a string names, and what is left once the size is removed. */
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

export const normalizeSizeToken = (text: string | null | undefined): string | null => splitSizeToken(text).token;

/** Do two spoken names refer to the same thing? exact → stem → phonetic → bounded fuzzy.
 *  Used by the cart engine to find an existing intent topping from a new
 *  spoken form ("mushrooms" ↔ "Mushroom"). Never used to pick from a MENU —
 *  the compiler does that, with negation guards this helper does not have. */
export function sameName(a: string, b: string): boolean {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const sa = stem(a);
  const sb = stem(b);
  if (sa === sb) return true;
  const pa = phonetic(a);
  if (pa.length >= 3 && pa === phonetic(b)) return true;
  const budget = fuzzyBudget(Math.min(sa.length, sb.length));
  return budget > 0 && editDistance(sa, sb) <= budget;
}
