/**
 * Everything that can change Nabil's behaviour, stamped on every call — so when
 * a metric moves we can say WHICH release, WHICH prompt, WHICH tool schema and
 * WHICH menu it moved with (directive §27).
 *
 * `hashJson` MUST match `src/lib/voice/sim/snapshot-hash.ts` byte for byte:
 * the menu snapshot fixture stores `menuHash = hashJson(menuPayload)` and the
 * service stamps the same over the payload it received, which is how a call is
 * matched to the fixture it can be replayed against. Pinned vector:
 * `hashJson({a:1,b:[1,2]}) === "8baa73198470c7bb"`.
 */
import { createHash } from "node:crypto";
import { fnv1a } from "./basket-signature";

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sortKeysDeep(o[k]);
    return out;
  }
  return v;
}

/** JSON.stringify over recursively key-sorted objects — same semantics as
 *  JSON.stringify otherwise (undefined dropped, toJSON honoured). */
export function stableStringify(v: unknown, space?: number): string {
  return JSON.stringify(sortKeysDeep(v), null, space);
}

/** sha256 of stableStringify, first 16 hex chars. */
export function hashJson(v: unknown): string {
  return createHash("sha256").update(stableStringify(v)).digest("hex").slice(0, 16);
}

/** Cheap non-cryptographic hash for things that only need to be stable in-process. */
export function quickHash(v: unknown): string {
  return fnv1a(stableStringify(v));
}

export type Versions = {
  agentVersion: string;
  promptVersion: string;
  toolsVersion: string;
  model: string;
  modelConfig: Record<string, unknown>;
  menuSnapshotHash: string | null;
  cfgHash: string | null;
  sttModel: string | null;
  ttsVoice: string | null;
};

/** The build the container was made from (Fly build arg → env), else a dev marker. */
export function agentVersion(): string {
  return process.env.NABIL_AGENT_VERSION || process.env.FLY_IMAGE_REF || `dev-${process.env.npm_package_version ?? "0"}`;
}
