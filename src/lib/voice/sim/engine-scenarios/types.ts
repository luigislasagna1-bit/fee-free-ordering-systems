/**
 * THE FREE TIER of the Nabil evaluation suite (directive: hundreds → 1000+
 * scenarios; Luigi 2026-08-15: no more $100 test cycles).
 *
 * An engine scenario is a script of TOOL CALLS — the structured operations the
 * model would emit — applied straight to the production tool layer
 * (`executeTool` → CartEngine → the real compiler over the fixture menu), with
 * an EXPECTED FINAL CART. No language model is involved, so it costs nothing,
 * runs in `npm test`, and scales by parameter space (see generator.ts). It
 * proves the deterministic 90 % of the pipeline — resolver, engine semantics,
 * compiler, half/half, combos, corrections, undo, validation — so the paid
 * LLM tier only has to prove interpretation.
 */
import type { CanonicalCart } from "../scenario-types";

export type EngineOp = {
  /** A voice tool name (add_to_order, update_line, remove_line, set_fulfilment, set_customer, get_order_state, quote_order…). */
  tool: string;
  input: Record<string, unknown>;
  /** The caller's words for this step — `hint`s are sanitised against them exactly as in a call. */
  said?: string;
  /** This op happens in the SAME caller turn as the previous one (one sentence
   *  that adds two pizzas) — the engine's sibling/deixis rules depend on it. */
  sameTurn?: boolean;
  /** What the tool must answer. Omitted ⇒ must be ok. */
  expect?: {
    ok?: boolean;
    code?: string;
    /** Substring the speakExactly must contain (spoken layer). */
    speaks?: string;
    /** speakExactly must NOT match this regex source (naturalness). */
    mustNotSpeak?: string;
  };
};

export type EngineScenario = {
  id: string;
  title: string;
  taxonomy: string[];
  /** Fixture slug (default luigis). */
  restaurant?: string;
  ops: EngineOp[];
  expected: {
    cart: CanonicalCart;
    /** Blocking problem codes that must remain after the ops (default: none). */
    problems?: string[];
    fulfilment?: "pickup" | "delivery";
    customerName?: string;
  };
};

export type EngineRunResult = {
  id: string;
  pass: boolean;
  reasons: string[];
  cartDiffSummary: string;
  spoken: string[];
  problems: string[];
  ops: number;
};
