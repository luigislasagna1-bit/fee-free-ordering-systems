/**
 * The synthetic identity a phone caller arrives with.
 *
 * `/api/orders` requires a valid customerEmail, and a caller on the phone has
 * not given one — so the voice service synthesizes `voice.<digits>@voice.nabil.invalid`
 * (see `services/nabil-voice/src/tools.ts` `sentinelEmail`). `.invalid` is
 * reserved by RFC 2606 precisely so it can never resolve or be delivered to.
 *
 * 🚨 That address is NOT an identity. The order route resolves customers by
 * EMAIL, so a sentinel address matches nothing and mints a brand-new Customer
 * row every time — which is how Roya Safi, a three-order regular, ended up with
 * a second record under a speech-to-text version of her name on 2026-08-13,
 * her lifetime totals split across two rows and her rewards stranded on the one
 * she can't reach. Anywhere a sentinel is recognised, the PHONE is the identity.
 */
export const VOICE_SENTINEL_DOMAIN = "@voice.nabil.invalid";

/** True for the synthetic address a voice order carries — never a real inbox. */
export function isVoiceSentinelEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(VOICE_SENTINEL_DOMAIN);
}

/**
 * True for any address that provably cannot receive mail — the `.invalid` TLD
 * is reserved for exactly this (RFC 2606), and we mint two kinds: the voice
 * sentinel above, and `@deleted.invalid` stamped by data erasure.
 *
 * Sending to one is not merely pointless: every message hard-bounces, and
 * enough hard bounces damage the sending domain's reputation for every real
 * customer. Guard transactional email with this.
 */
export function isNonRoutableEmail(email: string | null | undefined): boolean {
  return /@([^@]*\.)?invalid$/i.test(String(email ?? ""));
}
