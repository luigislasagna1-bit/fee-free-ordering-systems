/**
 * Aggregate METRICS over a batch of scenario reports (directive §24).
 * All rates are 0..1; latencies in ms; cost in cents. `flakyIds` are
 * scenarios that passed some runs and failed others — the ones worth reading
 * first, because they show non-determinism rather than a plain bug.
 */
import type { ScenarioReport } from "./scenario-types";

export type SimMetrics = {
  scenarios: number;
  runs: number;
  passRate: number;
  exactCartAccuracy: number;
  itemAccuracy: number;
  modifierAccuracy: number;
  halfSideAccuracy: number;
  comboSlotAccuracy: number;
  completionRate: number;
  wrongPlacementRate: number;
  toolFailureRate: number;
  hallucinationRate: number;
  clarificationPrecision: number;
  escalationRate: number;
  ttftP50: number | null;
  ttftP95: number | null;
  toolP95: number | null;
  turnsPerScenario: number;
  costPerScenarioCents: number;
  totalCostCents: number;
  /** Model spend per ESTIMATED real call-minute. A real caller turn (speech +
   *  TTS + pause) runs ~10 s, so minutes ≈ turns × 10 s. Luigi's ceiling is
   *  40¢/min ALL-IN; Twilio ConversationRelay + inbound voice take ~8¢, so the
   *  model must stay under ~30¢. Prod reference 2026-08-15: ~19¢/min. */
  modelCentsPerEstMinute: number;
  turnsPerEstMinute: number;
  /** Share of agent utterances that read like a machine (see isRoboticUtterance):
   *  ticket punctuation, line/pick ids, "left half:", numbered lists, currency
   *  codes, generic SKU names. Luigi's live call 2026-08-15 was 1/4. Target 0. */
  roboticUtteranceRate: number;
  roboticUtterances: Array<{ id: string; turn: number; text: string; why: string }>;
  flakyIds: string[];
  failedIds: string[];
};

/**
 * NATURALNESS LINT — the deterministic part of "does it sound like a person".
 * The sim cannot hear TTS, but it can catch what the caller heard on
 * 2026-08-15: "Large 2 Topping — left half: Pepperoni, Mushrooms; right half:
 * …", "1. … 2. …", "CA$0.02". Returns the first reason or null.
 */
export function isRoboticUtterance(text: string): string | null {
  const t = String(text ?? "");
  if (!t.trim()) return null;
  if (/[;×]/.test(t)) return "ticket punctuation (; ×)";
  if (/\b(?:left|right) half:/i.test(t)) return "'left half:' ticket phrasing";
  if (/(?:^|\s)\d\.\s+\S/.test(t)) return "numbered list";
  if (/(?:\b(?:CA|US|AU|NZ))?\$\s?\d/.test(t) || /\b(?:CAD|USD|EUR|GBP)\b/.test(t)) return "currency symbol/code instead of words";
  if (/\b[LP]\d{1,2}\b/.test(t)) return "line/pick id spoken";
  if (/\b(?:tool|modifier|slot|line id|menu id)\b/i.test(t)) return "system vocabulary";
  if (/\b(?:xx?-?l|xl|extra[- ]?large|large|medium|small)\s+\d\s*-?\s*topping\b/i.test(t)) return "generic SKU name spoken";
  return null;
}

/** Real-call pacing assumption for cost-per-minute (see SimMetrics). */
export const EST_SECONDS_PER_TURN = 10;
/** Luigi 2026-08-15: ≤ 40¢ per call-minute all-in ⇒ model ≤ ~30¢ after Twilio. */
export const MODEL_CENTS_PER_MINUTE_BUDGET = 30;

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const pct = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

export function computeMetrics(reports: ScenarioReport[]): SimMetrics {
  const ids = [...new Set(reports.map((r) => r.id))];
  const byId = new Map<string, ScenarioReport[]>();
  for (const r of reports) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
  const flakyIds = ids.filter((id) => {
    const rs = byId.get(id)!;
    return rs.some((r) => r.pass) && rs.some((r) => !r.pass);
  });
  const failedIds = ids.filter((id) => byId.get(id)!.some((r) => !r.pass));

  let items = { c: 0, t: 0 };
  let mods = { c: 0, t: 0 };
  let halves = { c: 0, t: 0 };
  let slots = { c: 0, t: 0 };
  let toolCalls = 0;
  let toolFails = 0;
  let clarTP = 0;
  let clarPredicted = 0;
  const ttfts: number[] = [];
  const tools: number[] = [];
  let turns = 0;
  let cost = 0;
  let escalations = 0;
  let wrongPlacement = 0;
  let utterances = 0;
  const robotic: SimMetrics["roboticUtterances"] = [];

  for (const r of reports) {
    items = { c: items.c + r.cartDiff.items.correct, t: items.t + r.cartDiff.items.total };
    mods = { c: mods.c + r.cartDiff.modifiers.correct, t: mods.t + r.cartDiff.modifiers.total };
    halves = { c: halves.c + r.cartDiff.halves.correct, t: halves.t + r.cartDiff.halves.total };
    slots = { c: slots.c + r.cartDiff.comboSlots.correct, t: slots.t + r.cartDiff.comboSlots.total };
    for (const t of r.turns) {
      for (const tc of t.toolCalls) {
        toolCalls++;
        if (!tc.ok) toolFails++;
        if (tc.name === "transfer_to_human" && tc.ok) escalations++;
      }
      if (typeof t.ttftMs === "number") ttfts.push(t.ttftMs);
      if (t.agent && t.agent.trim()) {
        utterances++;
        const why = isRoboticUtterance(t.agent);
        if (why && robotic.length < 200) robotic.push({ id: r.id, turn: t.idx, text: t.agent.slice(0, 200), why });
        else if (why) robotic.push({ id: r.id, turn: t.idx, text: "", why });
      }
      // Precision is measured only where a scenario SAYS where clarification
      // belongs: of the scripted turns Nabil clarified on, how many were the
      // declared ones. Recall is what `pass` already enforces.
      if (t.clarified && typeof t.scriptIndex === "number" && r.clarifications.expectedAt.length) {
        clarPredicted++;
        if (r.clarifications.expectedAt.includes(t.scriptIndex)) clarTP++;
      }
    }
    if (typeof r.latency.toolP95 === "number") tools.push(r.latency.toolP95);
    turns += r.turns.length;
    cost += r.costCents;
    // Placed when it must not, or a placed cart that is not the expected cart.
    if (r.placed && (!r.cartDiff.exact || r.reasons.some((x) => x.includes("mustPlace=false")))) wrongPlacement++;
  }
  const n = reports.length;
  return {
    scenarios: ids.length,
    runs: n,
    passRate: ratio(reports.filter((r) => r.pass).length, n),
    exactCartAccuracy: ratio(reports.filter((r) => r.cartDiff.exact).length, n),
    itemAccuracy: ratio(items.c, items.t),
    modifierAccuracy: ratio(mods.c, mods.t),
    halfSideAccuracy: ratio(halves.c, halves.t),
    comboSlotAccuracy: ratio(slots.c, slots.t),
    completionRate: ratio(reports.filter((r) => r.placed).length, n),
    wrongPlacementRate: ratio(wrongPlacement, n),
    toolFailureRate: ratio(toolFails, toolCalls),
    hallucinationRate: ratio(reports.filter((r) => r.hallucinationFlags.length > 0).length, n),
    // Of the turns where Nabil clarified, how many were turns a scenario said it should.
    clarificationPrecision: clarPredicted ? clarTP / clarPredicted : 1,
    escalationRate: ratio(reports.filter((r) => r.turns.some((t) => t.toolCalls.some((c) => c.name === "transfer_to_human" && c.ok))).length, n),
    ttftP50: pct(ttfts, 50),
    ttftP95: pct(ttfts, 95),
    toolP95: pct(tools, 95),
    turnsPerScenario: ratio(turns, n),
    costPerScenarioCents: ratio(cost, n),
    totalCostCents: cost,
    modelCentsPerEstMinute: ratio(cost, (turns * EST_SECONDS_PER_TURN) / 60),
    turnsPerEstMinute: 60 / EST_SECONDS_PER_TURN,
    roboticUtteranceRate: ratio(robotic.length, utterances),
    roboticUtterances: robotic.filter((x) => x.text),
    flakyIds,
    failedIds,
  };
}
