/**
 * CLAIMS GUARD — did the sentence the caller just heard rest on evidence?
 *
 * Measurement first, blocking later (directive §10, §32). After each turn we
 * check the spoken text against what the tools returned THIS turn (plus a few
 * static menu facts) for the four claim types that have burned real calls:
 *   • unavailability — "we don't have red onion" with no tool saying so
 *     (2026-08-15: a truncated prompt list, asserted as the whole menu);
 *   • an unsourced price — a number spoken that no tool produced;
 *   • a false confirmation — "your order is placed" while nothing was;
 *   • read-back drift — a `speakExactly` item name not spoken as written
 *     (2026-08-14: "Large 1 Topping" read back as "extra large").
 * Each hit is an event, not an interruption: a streamed sentence is already
 * on the line by the time we can judge it. When the false-positive rate is
 * known, the loop can start buffering high-risk sentences instead.
 */
export type ClaimHit = { kind: "unavailability" | "unsourced_price" | "false_confirmation" | "readback_drift"; sentence: string; evidence: string[] };

const UNAVAILABLE = /\b(don'?t|do not|doesn'?t|does not|can'?t|cannot|not able to|unable to)\s+(have|offer|do|carry|get|make|add|put)\b|\bnot available\b|\bisn'?t available\b|\b(not|isn'?t) an option\b|\bsold out\b|\bwe'?re out of\b|\bnot on (the|our) menu\b/i;
const CONFIRMED = /\b(order (is|has been) (placed|confirmed|in|sent)|(placed|sent) (your|the) order|on its way|order number|you'?re all set|all set)\b/i;
const PRICE = /(?:\$\s?\d+(?:\.\d{1,2})?)|\b\d+\s*(?:dollars?|bucks)\b|\b\d+\s+(?:\d{2})\b/g;

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function checkClaims(args: {
  spoken: string;
  toolOutputs: unknown[];
  toolNames: string[];
  placedThisCall: boolean;
  speakExactly: string[];
  menuFacts?: { soldOut: string[]; notToday: string[] };
}): ClaimHit[] {
  const hits: ClaimHit[] = [];
  const spoken = args.spoken ?? "";
  if (!spoken.trim()) return hits;
  const evidenceText = args.toolOutputs.map((o) => (typeof o === "string" ? o : JSON.stringify(o) ?? "")).join("\n").toLowerCase();
  const menuFacts = args.menuFacts ?? { soldOut: [], notToday: [] };

  for (const s of sentences(spoken)) {
    if (UNAVAILABLE.test(s)) {
      const grounded =
        /truncated|andmore|sold ?out|nottoday|not_found|unknown_item|couldn'?t find|no such|not on|unresolved|isn'?t one of|only \d+ choice|error/.test(evidenceText) ||
        menuFacts.soldOut.some((n) => s.toLowerCase().includes(n.toLowerCase())) ||
        menuFacts.notToday.some((n) => s.toLowerCase().includes(n.toLowerCase())) ||
        args.toolNames.includes("get_item_options") ||
        args.toolNames.includes("find_menu_item");
      if (!grounded) hits.push({ kind: "unavailability", sentence: s, evidence: args.toolNames });
    }
    const prices = s.match(PRICE) ?? [];
    for (const p of prices) {
      const digits = p.replace(/[^\d.]/g, "");
      const n = Number(digits);
      if (!Number.isFinite(n) || n === 0) continue;
      const forms = [n.toFixed(2), String(n), digits, n.toFixed(2).replace(/\.00$/, "")];
      const seen = forms.some((f) => f && evidenceText.includes(f));
      if (!seen && args.toolNames.length) hits.push({ kind: "unsourced_price", sentence: s, evidence: forms });
    }
    if (CONFIRMED.test(s) && !args.placedThisCall) hits.push({ kind: "false_confirmation", sentence: s, evidence: [] });
  }
  for (const exact of args.speakExactly) {
    const names = exact.match(/(?:\d+×\s*)?([A-Z][A-Za-z0-9' ]{2,40}?)(?=\s[—:(]|,|$)/g) ?? [];
    for (const nm of names.slice(0, 3)) {
      const bare = nm.replace(/^\d+×\s*/, "").trim();
      if (bare.length < 4) continue;
      if (!spoken.toLowerCase().includes(bare.toLowerCase())) {
        hits.push({ kind: "readback_drift", sentence: spoken.slice(0, 200), evidence: [bare] });
        break;
      }
    }
  }
  return hits;
}
