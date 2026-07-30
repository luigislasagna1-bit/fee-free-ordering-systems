/**
 * ONE definition of "which hostnames mean the same domain".
 *
 * The host resolver treats `luigis.com` and `www.luigis.com` as one identity
 * (Vercel routes both to us). Any code that CLAIMS a domain must use the exact
 * same identity, or the two disagree — which was a real cross-tenant hijack
 * vector caught in adversarial review before ship (2026-07-30):
 *
 *   connect-custom checked `pendingCustomDomain === "victim.com"` (exact),
 *   the resolver matched `IN ("victim.com", "www.victim.com")`,
 *   so a tenant could park "www.victim.com" past the check and then answer
 *   for the victim's apex once the victim pointed DNS here.
 *
 * Import this from BOTH sides. Never hand-roll the www strip again.
 */

/** Bare (apex-ish) form: lowercase, no port, no protocol, no leading "www.". */
export function bareHost(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .split(":")[0]
    .replace(/^www\./, "");
}

/** Every hostname spelling that must resolve to the same tenant. */
export function hostCandidates(value: string): string[] {
  const bare = bareHost(value);
  if (!bare) return [];
  return Array.from(new Set([bare, `www.${bare}`]));
}
