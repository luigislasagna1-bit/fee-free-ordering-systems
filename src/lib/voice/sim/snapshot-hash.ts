import { createHash } from "node:crypto";

/**
 * Deterministic hashing for menu snapshots.
 *
 * `hashJson(v)` = first 16 hex chars of sha256 over `stableStringify(v)`, where
 * `stableStringify` is `JSON.stringify` with every object's keys sorted
 * recursively — and otherwise EXACTLY `JSON.stringify` semantics (undefined
 * properties dropped, `toJSON()` honoured, NaN → null, arrays kept in order).
 *
 * That "otherwise exactly JSON.stringify" is the whole contract: the snapshot
 * script hashes the `body` object `buildVoiceMenuPayload` returns BEFORE it is
 * serialised, and the voice service hashes the object it gets back from
 * `JSON.parse` of the /menu response. Those two objects round-trip through
 * JSON, so sorting keys and re-stringifying them yields identical bytes on both
 * sides — same menu ⇒ same `menuHash`, no matter who computed it.
 *
 * Node-only (`node:crypto`); both producers run on Node.
 */

function sortKeysDeep(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  const withToJson = v as { toJSON?: () => unknown };
  if (typeof withToJson.toJSON === "function") return sortKeysDeep(withToJson.toJSON());
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) out[k] = sortKeysDeep(src[k]);
  return out;
}

/** JSON.stringify with recursively sorted object keys. `space` is for the
 *  pretty on-disk fixture only — hashing always uses the compact form. */
export function stableStringify(v: unknown, space?: number): string {
  return JSON.stringify(sortKeysDeep(v), null, space);
}

/** sha256(stableStringify(v)) truncated to 16 hex characters (64 bits). */
export function hashJson(v: unknown): string {
  return createHash("sha256").update(stableStringify(v), "utf8").digest("hex").slice(0, 16);
}
