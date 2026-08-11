/**
 * The duplicate-order contract, isolated as a pure module so it can be unit
 * tested (no env, no network, no SDK).
 *
 * A signature identifies a BASKET. Two things depend on it:
 *   • `ctx.placedOrders` — the in-call guard that refuses to place the same
 *     basket twice (2026-08-10: a caller's "Yeah." + "Yes." arrived as two
 *     prompts and produced two real orders 1.7s apart).
 *   • `idempotencyKey` — `voice-<callSid>-<fnv1a(signature)>`, which makes
 *     /api/orders return the existing order instead of minting a second.
 *
 * ⚠️ It MUST capture every field that distinguishes two baskets, or the guard
 * silently DROPS a legitimate second order. Modifier NAMES are load-bearing:
 * half-and-half placement lives entirely in the name prefix ("(L.H) Pepperoni"
 * vs "(R.H) Pepperoni" share one option id), so hashing ids alone would make a
 * left-half pizza and a right-half pizza collide. Combo children live in
 * `bundleItems` and are likewise part of the identity.
 */

const modKeys = (list: unknown): string[] =>
  (Array.isArray(list) ? list : [])
    .map((mod: any) => `${String(mod?.modifierOptionId ?? "")}|${String(mod?.name ?? "")}`)
    .sort();

/** Canonical basket signature: the same items in any order → the same string.
 *  Order-level notes are deliberately EXCLUDED — a re-send of the same items
 *  with a reworded note is the same order intent, not a new order. */
export function basketSignature(input: any): string {
  const items = (Array.isArray(input?.items) ? input.items : [])
    .map((it: any) => ({
      m: String(it?.menuItemId ?? ""),
      v: String(it?.variantId ?? ""),
      q: Number(it?.quantity ?? 1),
      o: modKeys(it?.modifiers),
      // Combo children, in slot order — order is meaningful, the server
      // assigns slots greedily by it.
      b: (Array.isArray(it?.bundleItems) ? it.bundleItems : []).map(
        (c: any) =>
          `${String(c?.menuItemId ?? "")}|${String(c?.variantId ?? "")}|${modKeys(c?.modifiers).join(",")}`,
      ),
    }))
    .sort((a: any, b: any) => (a.m + a.v).localeCompare(b.m + b.v));
  return JSON.stringify({ t: String(input?.type ?? ""), items });
}

/** FNV-1a 32-bit hex — stable, dependency-free hash for the idempotency key. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
