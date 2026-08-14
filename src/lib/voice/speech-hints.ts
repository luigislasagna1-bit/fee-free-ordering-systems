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

/**
 * TOPPINGS GO FIRST. This used to read "items get the larger guaranteed share;
 * toppings keep a reserved floor" — but the code packed items against a 300-char
 * budget BEFORE toppings saw any, and 150 item names always exhausted it. On a
 * real store that left 35 boosted terms, 18 of them item names, "Gift Card" and
 * "Milk" among them, and **three of the six toppings on the 2026-08-14 pizza
 * absent entirely** (Jalapeno, Green Peppers, Red Onion).
 *
 * Toppings are the words a pizza order actually lives on, the words callers
 * mumble, and the words that decide what the kitchen makes. Items are usually
 * said clearly and, unlike a topping, a mis-heard item name fails loudly — the
 * agent cannot find it and asks. A mis-heard topping just gets made.
 *
 * So: toppings against their own guaranteed budget first, then items with
 * whatever is left, then toppings again to mop up. A store with no toppings
 * still fills 500 chars with item names.
 */
export const HINTS_TOPPING_BUDGET = 380;

export const cleanHint = (s: string): string =>
  (s || "").replace(/[^A-Za-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Pack two prioritised term lists into one ≤500-char comma list.
 *
 * Toppings are packed first against their own budget, then items against the
 * full budget (inheriting whatever toppings left unspent), then toppings again
 * to mop up any remaining slack. A store with no toppings still gets 500 chars
 * of item names; a store with a long topping list no longer loses half of it to
 * gift cards.
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

  take(toppingTerms, HINTS_TOPPING_BUDGET);
  take(itemTerms, HINTS_MAX_CHARS);
  take(toppingTerms, HINTS_MAX_CHARS);
  return picked.join(",");
}
