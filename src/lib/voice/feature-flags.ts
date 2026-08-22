/**
 * Channel-scoped FEATURE FLAGS for Nabil AI — the switch that lets a behaviour
 * change exist in the shared Vercel codebase without touching the live line.
 *
 * Two lanes (src/lib/voice/voice-channel.ts): "staging" gets EVERY candidate
 * flag, so the staging phone line always exercises the newest behaviour;
 * "current" (the public line) gets only the flags listed in
 * NABIL_FLAGS_CURRENT (comma-separated names, or "*" for all). Promoting a
 * behaviour = adding its name to that env var; rolling it back = removing it.
 * No deploy, no code change, effective on the next call.
 *
 * Rules:
 *   - Only code paths that CHANGE what a live caller experiences are flagged.
 *     Purely additive work (new side tables, new routes, retries, telemetry)
 *     ships unflagged.
 *   - Every flag is registered below with the phase that introduced it, so a
 *     stale env var can never silently enable something unknown.
 *   - This file is copied VERBATIM to services/nabil-voice/src/feature-flags.ts
 *     (Fly's Docker context cannot import src/). feature-flags.test.ts pins the
 *     two copies byte-for-byte.
 */
export const NABIL_FLAGS = {
  /** A1 — after-stream/handoff decision table (row-without-reason → dial the
   *  store instead of redirecting into a fresh ConversationRelay session). */
  after_stream_decision_table: "A1 transfer invariants",
  /** A6 — set_fulfilment confirms a geocode whose street differs from what
   *  the caller said before accepting the pin. */
  street_mismatch_gate: "A6 engine contract fixes",
  /** A6 — /api/orders treats a verified-coordinate phone delivery as having a
   *  postcode (the ticket still prints the reverse-geocoded one). */
  postcode_waiver_voice: "A6 engine contract fixes",
  /** A5 — lookup_recent_orders answers order status for the caller's number. */
  order_status_tool: "A5 grounding + order status",
  /** A2 — the service speaks the compiled read-back itself on plain adds and
   *  skips the second model hop. */
  deterministic_recap: "A2 dead-air scheduler",
  /** A3 — outcome classifier writes the new outcomes (abandoned_with_cart,
   *  incomplete, spam) for LIVE calls; off = the legacy classifier. */
  outcome_classifier_v2: "A3 durable telemetry",
} as const;

export type NabilFlagName = keyof typeof NABIL_FLAGS;
export const NABIL_FLAG_NAMES = Object.keys(NABIL_FLAGS) as NabilFlagName[];

export type NabilFlags = Record<NabilFlagName, boolean>;

/** Parse NABIL_FLAGS_CURRENT ("a,b,c" | "*" | ""). Unknown names are reported,
 *  never enabled. */
export function parsePromotedFlags(raw: string | null | undefined): { enabled: Set<NabilFlagName>; all: boolean; unknown: string[] } {
  const s = (raw || "").trim();
  if (s === "*") return { enabled: new Set(NABIL_FLAG_NAMES), all: true, unknown: [] };
  const enabled = new Set<NabilFlagName>();
  const unknown: string[] = [];
  for (const part of s.split(",")) {
    const name = part.trim();
    if (!name) continue;
    if ((NABIL_FLAG_NAMES as string[]).includes(name)) enabled.add(name as NabilFlagName);
    else unknown.push(name);
  }
  return { enabled, all: false, unknown };
}

/** The flag set for one call's lane. `promoted` is the NABIL_FLAGS_CURRENT value. */
export function flagsFor(channel: string | null | undefined, promoted: string | null | undefined): NabilFlags {
  const out = {} as NabilFlags;
  if (channel === "staging") {
    for (const n of NABIL_FLAG_NAMES) out[n] = true;
    return out;
  }
  const { enabled } = parsePromotedFlags(promoted);
  for (const n of NABIL_FLAG_NAMES) out[n] = enabled.has(n);
  return out;
}

/** Convenience for a single flag. */
export function flagOn(name: NabilFlagName, channel: string | null | undefined, promoted: string | null | undefined): boolean {
  return flagsFor(channel, promoted)[name];
}
