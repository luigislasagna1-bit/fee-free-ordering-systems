/**
 * THE SIZE GATE for day deals.
 *
 * Luigi, 2026-08-11: "many items have sizes etc, make sure everything matches
 * exactly to the correct thing."
 *
 * His Chicken Cheese Steak is 6" $9.99 / 12" $15.99; the Thursday deal is the
 * same two sizes at $7.99 / $12.59. Those line up — but nothing in the data
 * model FORCES them to. If someone later edits the deal item down to a single
 * flat price, the compiler would cheerfully build a caller's 12" order against
 * it and quote $7.99: the wrong sandwich, and eight dollars of margin gone,
 * with no error anywhere. Same shape as the "asked for a Large, offered a
 * Medium" failure — silent, plausible, and only visible in the day's takings.
 *
 * So the pairing is checked, every time, against live data. Deliberately strict
 * and deliberately dumb: the failure being guarded against is a confident
 * guess, so "not sure" has to mean "don't offer it", never "close enough".
 *
 * Pure and dependency-free so both the menu annotation (which offers deals for
 * ordinary items) and the pizza compiler path can share the one rule.
 */

/**
 * Compare two size names the way a person would: case, spacing and punctuation
 * are noise (6' / 6" / "6 in" are the same shelf), anything else is a real
 * difference. "XL" and "X-Large" therefore do NOT match — and refusing an
 * honest pairing is the cheap mistake; offering a wrong one isn't.
 */
export const variantKey = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Do these two items offer the SAME set of sizes? Two flat-priced items
 * correspond (no size to get wrong); any mismatch does not.
 */
export function variantsCorrespond(
  standard: ReadonlyArray<{ name: string }>,
  deal: ReadonlyArray<{ name: string }>,
): boolean {
  const a = new Set(standard.map((v) => variantKey(v.name)));
  const b = new Set(deal.map((v) => variantKey(v.name)));
  if (a.size !== b.size) return false;
  for (const name of a) if (!b.has(name)) return false;
  return true;
}
