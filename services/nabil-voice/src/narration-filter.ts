/**
 * NARRATION FILTER — keeps the model's inner monologue off the phone line.
 *
 * With thinking OFF a model sometimes reasons in the TEXT channel before it
 * calls a tool ("They asked to take mushrooms off the first pizza — but
 * mushrooms were never added (the update was blocked by ambiguity). L1 is
 * pepperoni only; L2 has mushrooms."). Streamed token by token, that is
 * spoken to the caller — the "said something random" Luigi reported. The
 * playbook forbids it, but a deterministic guard is what makes it impossible:
 * in sentence-chunk TTS mode (NABIL_TTS_CHUNK=sentence) every clause is held
 * until complete, and a clause that reads as system talk is DROPPED and logged
 * (`narration_dropped` event) instead of being spoken. Only whole clauses that
 * are clearly internal are dropped — questions and ordinary replies pass.
 *
 * English only (the playbook is English; the leak vocabulary is the model's).
 */

const LEAK_MARKERS: RegExp[] = [
  /\bmenu item\b/i,
  /\b[LP]\d{1,2}\b/, // line / pick ids
  /\b(?:the|that) (?:update|tool|call|system|state|cart|line) (?:was|is|says|shows|returned|failed|blocked)/i,
  /\bwas blocked\b/i,
  /\bthey asked\b/i,
  /\bthe caller\b/i,
  /\bwhich means\b/i,
  /\bso "/,
  /\blikely means?\b/i,
  /\bI(?:'| wi)ll (?:use|set that up|check the|look up|verify|re-?send|call)\b/i,
  /\blet me (?:set that up|check the|look up|verify|re-?send|use)\b/i,
  /\bI need to (?:make sure|check|verify|set|use|call)\b/i,
  /\bmodifier|\bslot\b|\bpayload\b|\bschema\b/i,
];

/** True when a complete clause is the model talking to itself, not to the caller. */
export function isNarrationLeak(clause: string): boolean {
  const t = String(clause ?? "").trim();
  if (!t) return false;
  // A question to the caller is never dropped, even if it names a thing oddly.
  if (/\?\s*["')]?$/.test(t)) return false;
  return LEAK_MARKERS.some((re) => re.test(t));
}
