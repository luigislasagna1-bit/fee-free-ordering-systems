/**
 * Deepgram speech hints for Nabil AI — the per-restaurant lexical grounding that
 * is our structural edge over generic ASR training. We own the catalog, so the
 * vocabulary we bias recognition toward is always exactly this store's menu.
 *
 * 🚨 THE TRAP. ConversationRelay REJECTS the `hints` attribute unless it is
 * strictly clean, and a rejected attribute kills the call BEFORE the greeting.
 * On 2026-08-09 every pilot call died with "Deepgram invalid argument: 400 Bad
 * Request" and fell through to the store phone. Two causes, both from real menu
 * data: punctuation in names ("MINI CARROTS + RANCH DIP", "Kit!") and total
 * length (we sent 2,021 chars; the limit is 500).
 *
 * So: strip to [A-Za-z0-9 -], collapse whitespace, dedupe case-insensitively,
 * and pack terms WHOLE — never truncated, because half a dish name biases
 * recognition toward a phrase nobody says.
 */

/** ConversationRelay's documented ceiling for the whole comma-joined string. */
export const HINTS_MAX_CHARS = 500;

/** Items get the larger guaranteed share; toppings keep a reserved floor. They
 *  are the words callers mumble ("pepperoni", "bocconcini", "giardiniera") and,
 *  now that Nabil BUILDS pizzas, the words that decide what the kitchen makes. */
export const HINTS_ITEM_BUDGET = 300;

export const cleanHint = (s: string): string =>
  (s || "").replace(/[^A-Za-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Pack two prioritised term lists into one ≤500-char comma list.
 *
 * Items are packed first against their own budget, then toppings against the
 * full budget (so they inherit whatever items left unspent), then items again
 * to mop up any remaining slack. That way a store with three menu items still
 * fills 500 chars with toppings, and a store with no toppings still gets 500
 * chars of item names.
 */
export function packHints(itemTerms: string[], toppingTerms: string[]): string {
  const used = new Set<string>();
  const picked: string[] = [];
  let len = 0;

  const take = (terms: string[], budget: number) => {
    for (const raw of terms) {
      const term = cleanHint(raw);
      if (term.length < 2 || term.length > 40) continue;
      const key = term.toLowerCase();
      if (used.has(key)) continue;
      const next = len === 0 ? term.length : len + 1 + term.length;
      // SKIP, don't break: one long name must not cost every shorter name
      // behind it.
      if (next > budget || next > HINTS_MAX_CHARS) continue;
      used.add(key);
      picked.push(term);
      len = next;
    }
  };

  take(itemTerms, HINTS_ITEM_BUDGET);
  take(toppingTerms, HINTS_MAX_CHARS);
  take(itemTerms, HINTS_MAX_CHARS);
  return picked.join(",");
}
