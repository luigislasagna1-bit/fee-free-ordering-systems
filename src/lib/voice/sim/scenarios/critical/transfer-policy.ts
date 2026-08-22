/**
 * A1b — per-store TRANSFER POLICY (Luigi 2026-08-22: "some stores don't want
 * ANY transfers, some very little, some as soon as the customer asks").
 *
 * The same "can I talk to a person?" script under each level. The policy is
 * enforced in code (services/nabil-voice/src/transfer-policy.ts); these
 * scenarios prove the whole loop — prompt paragraph, tool result, spoken
 * deflection, second-ask hand-off — end to end against the real session.
 */
import type { Scenario } from "../../scenario-types";
import { L } from "../luigis-ids";
import { PLACE_IF_DONE } from "../../harness";

const A: Record<string, string> = {
  "(your|the|a) name|name for the order|who('s| is) (this|it) for|name (should|do) i put": "It's Marco.",
  "(best|good|right|correct) number|callback|reach you|call you back|number (i have|on file)|\\d{3} \\d{3} \\d{4}": "Yes, that's the right number.",
  "pick ?up or delivery|delivery or pick ?up|for pickup or": "Pickup.",
  "(is that|does that|do i have that|did i get that|sound) (right|correct|good|ok)\\??|correct\\?$|right\\?$": "Yes, that's right.",
  "(shall|should|can|may) i (go ahead and )?(place|send|put)|place (it|the order|that)\\?|send (it|that) (through|in)\\?|good to go\\?|ready to (place|send)|want me to (place|send)|(place|send) (it|that|the order) (now|for you)\\?": PLACE_IF_DONE,
};
const FAMILY_L: string[] = [L.large1, L.large2, L.large3, L.large5, L.buildYourOwn];

/** The localized default deflection (voice-i18n `transferDeflect`, en). */
const DEFLECT = "busy preparing orders";
/** Things a deflected agent must never say — nobody is going to pick up. */
const CONNECTING = [
  "connecting you",
  "putting you through",
  "put you through",
  "transferring you (now|to)",
  "one (moment|second) while i (get|find|grab|connect)",
  "(get|grab|find) (someone|a team member|a person|a manager|an employee) (for you|who can|to help)",
];

const base = (id: string, title: string, policy: "never" | "reluctant" | "immediate", turns: string[], expected: Scenario["expected"]): Scenario => ({
  id,
  title,
  suite: ["critical"],
  restaurant: L.restaurant,
  taxonomy: ["transfer", "policy"],
  backend: { config: { transferPolicy: policy } },
  caller: { mode: "script", turns, answers: A, maxTurns: turns.length + 8 },
  expected,
});

export const X03: Scenario = base(
  "C-XFER-03_policy_never",
  "Transfer policy NEVER — deflect with the store line, keep helping, take the order",
  "never",
  ["Hi, can I talk to a person? Someone who actually works there, please.", "Okay then. Pickup — a large pepperoni pizza.", "That's everything.", "Yes."],
  {
    cart: { lines: [{ item: L.large1, itemAlt: FAMILY_L.filter((x) => x !== L.large1), qty: 1, options: [], halves: { left: [], right: [], whole: ["pepperoni"] } }] },
    fulfilment: { type: "pickup" },
    customer: { name: "Marco" },
    mustPlace: true,
    mustSay: [DEFLECT],
    mustNotSay: CONNECTING,
    maxToolErrors: 0,
  },
);

export const X04: Scenario = base(
  "C-XFER-04_policy_reluctant",
  "Transfer policy RELUCTANT — the first ask is deflected, the second ask is put through",
  "reluctant",
  ["Can I speak to a person, please?", "No, I really do need to talk to someone in the store."],
  { cart: { lines: [] }, mustPlace: false, mustSay: [DEFLECT], mustTransfer: true, maxToolErrors: 0 },
);

export const X05: Scenario = base(
  "C-XFER-05_policy_immediate",
  "Transfer policy IMMEDIATE (default) — put through on the first ask, no deflection",
  "immediate",
  ["Can I speak to a person, please?"],
  { cart: { lines: [] }, mustPlace: false, mustNotSay: [DEFLECT], mustTransfer: true, maxToolErrors: 0 },
);

export const CRITICAL_XFER: Scenario[] = [X03, X04, X05];
