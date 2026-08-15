/**
 * "Name on file" for a phone number that has no single Customer record —
 * derived from OUR OWN previous voice tickets on that number.
 *
 * Rule (Luigi's live call 2026-08-15): the LAST voice order's name is not
 * enough. His own test line had ordered as Sam, Dishen, Jashan and Dishen, so
 * Nabil opened with "I have you down as Dishen — is that right?" to Sam. A
 * shared family or work phone does exactly this in real life. We only offer a
 * name when the recent history AGREES: the last `MIN_AGREEING` voice orders
 * (most recent first) all carry the same first name. Fewer orders than that,
 * or any disagreement, ⇒ no hint — Nabil simply asks.
 *
 * Pure so it can be unit-tested without a database.
 */

export const MIN_AGREEING = 3;

/** Strip the "(phone)" placeholder the voice path appends and compare on the
 *  first token, case-insensitively ("Sam", "sam (phone)", "Sam Nabil" agree). */
export function firstNameKey(customerName: string | null | undefined): string {
  return String(customerName ?? "")
    .replace(/\s*\(phone\)\s*$/i, "")
    .trim()
    .split(/\s+/)[0]
    ?.toLowerCase() ?? "";
}

/**
 * @param recentNames customerName of the most recent voice orders on this
 *   number, newest first (already limited by the caller, e.g. take: 3).
 * @returns the display name to OFFER (from the newest order, placeholder
 *   stripped), or null when the history is short or disagrees.
 */
export function nameHintFromRecentVoiceOrders(recentNames: Array<string | null | undefined>): string | null {
  const cleaned = recentNames.map((n) => String(n ?? "").replace(/\s*\(phone\)\s*$/i, "").trim()).filter(Boolean);
  if (cleaned.length < MIN_AGREEING) return null;
  const keys = cleaned.slice(0, MIN_AGREEING).map(firstNameKey);
  if (!keys[0] || keys.some((k) => k !== keys[0])) return null;
  return cleaned[0];
}
